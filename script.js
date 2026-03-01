// ==========================================
// 1. SMART IP REDIRECTOR (FIXES 404 ERROR)
// ==========================================
function extractCleanIp(inputString) {
    if (!inputString) return null;
    // Magically extracts just the IPv4 address, ignoring http://, ports, or extra text
    let match = inputString.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    return match ? match[0] : inputString.replace(/^https?:\/\//, '').split(':')[0].replace(/\/$/, "");
}

let currentHost = window.location.hostname;

// If user opens jarvis.html on GitHub, prompt and redirect instantly to local PC
if (currentHost.includes('github.io')) {
    let savedIp = localStorage.getItem("jarvis_ip");
    let rawIp = prompt("Jarvis Direct Link:\n\nYou are on the cloud version. To connect, please enter the IP shown on your Arduino Display (e.g., 192.168.1.10):", savedIp || "");
    
    if (rawIp) {
        let cleanIp = extractCleanIp(rawIp);
        localStorage.setItem("jarvis_ip", cleanIp);
        window.location.href = `http://${cleanIp}:5000/jarvis.html`;
    }
}

// ==========================================
// 2. GLOBAL VARIABLES
// ==========================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwR3LH7qkeNNNZgEhOSMFqXZcO9xyVF7DiQau7gDxcTJ6ljtgD4EwrIm8tmC-B-fMpMag/exec'; 
let currentUser = null;
let currentPass = null;

// Always uses relative path because it's hosted locally
const JARVIS_URL = `/chat`; 
const MIC_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const STOP_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12"></rect></svg>`;

// ==========================================
// 3. INITIALIZATION (Document Ready)
// ==========================================
$(document).ready(function() {
    toggleLogoutButton(false);
    var savedUser = sessionStorage.getItem('currentUser');
    var savedPass = sessionStorage.getItem('currentPass');
    
    if (savedUser && savedPass) {
        currentUser = savedUser;
        currentPass = savedPass;
        toggleLogoutButton(true);
    }

    $('#mobile-search-input').on('keyup', function() {
        if ($.fn.DataTable.isDataTable('#inventory')) {
            $('#inventory').DataTable().search(this.value).draw();
        }
    });

    $('#mobile-sort-select').on('change', function() {
        if ($.fn.DataTable.isDataTable('#inventory')) {
            var val = $(this).val();
            var parts = val.split('_');
            $('#inventory').DataTable().order([parseInt(parts[0]), parts[1]]).draw();
        }
    });

    $('#chat-input').on('keypress', function (e) {
        if(e.which === 13) {
            e.preventDefault();
            sendText();
        }
    });
    
    window.addEventListener('resize', () => {
        let chatBox = $('#chat-history')[0];
        if(chatBox) chatBox.scrollTop = chatBox.scrollHeight;
    });
});

function toggleLogoutButton(show) {
    if (show) $('#logout-section').show(); else $('#logout-section').hide();
}

// ==========================================
// 4. JARVIS CHAT LOGIC
// ==========================================
function addChatMsg(text, isUser) {
    let cls = isUser ? 'user-msg' : 'bot-msg';
    let avatar = isUser ? '' : `<img src="jarvis-icon.jpg" class="chat-avatar" onerror="this.style.display='none'">`;
    let label = isUser ? 'YOU' : 'JARVIS';
    
    let html = `
        <div class="chat-msg ${cls}">
            ${avatar}
            <div class="msg-content">
                <div class="msg-label" style="color: ${isUser ? '#e0e0e0' : '#666'}">${label}</div>
                ${text}
            </div>
        </div>
    `;
    
    $('#chat-history').append(html);
    let chatBox = $('#chat-history')[0];
    if(chatBox) chatBox.scrollTop = chatBox.scrollHeight;
}

function sendText() {
    let inputEl = $('#chat-input');
    let text = inputEl.val().trim();
    if(!text) return;

    addChatMsg(text, true);
    inputEl.val('');
    inputEl.blur(); 
    
    $('#send-btn').prop('disabled', true).css('opacity', '0.5');

    fetch(JARVIS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
    })
    .then(res => res.json())
    .then(data => {
        $('#send-btn').prop('disabled', false).css('opacity', '1');
        let reply = data.response || "Command processed.";
        addChatMsg(reply, false);
        speakText(reply);
    })
    .catch(err => {
        // Silently ignore errors if user is leaving the page
        if (window.isNavigating) return; 

        console.error("Jarvis Error:", err);
        $('#send-btn').prop('disabled', false).css('opacity', '1');
        
        let rawIp = prompt("Connection failed! The IP address may have changed.\n\nPlease enter the new IP shown on the Arduino Display (e.g., 192.168.1.10):");
        
        if (rawIp) {
            let cleanIp = extractCleanIp(rawIp);
            localStorage.setItem("jarvis_ip", cleanIp);
            window.location.href = `http://${cleanIp}:5000/jarvis.html`;
        } else {
            addChatMsg(`⚠️ Connection failed. Please ensure your Python server is running.`, false);
        }
    });
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        let utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

// ==========================================
// 5. JARVIS VOICE RECOGNITION
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "en-US";
    
    recognition.onresult = function(e) {
        $('#mic-btn').removeClass('active').html(MIC_SVG);
        let text = e.results[0][0].transcript;
        $('#chat-input').val(text);
        isRecording = false;
        sendText(); 
    };
    
    recognition.onerror = function(e) { 
        $('#mic-btn').removeClass('active').html(MIC_SVG);
        if($('#chat-input').val() === "Listening...") $('#chat-input').val("");
        isRecording = false;
    };
    
    recognition.onend = function() { 
        $('#mic-btn').removeClass('active').html(MIC_SVG);
        if($('#chat-input').val() === "Listening...") $('#chat-input').val("");
        isRecording = false;
    };
} else {
    $('#mic-btn').hide(); 
}

function startVoice() {
    if (!recognition) return alert("Voice input not supported.");
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
        $('#mic-btn').addClass('active').html(STOP_SVG);
        $('#chat-input').val("Listening...");
        isRecording = true;
    }
}