// State variables
let record = false;
let videoStream = null;
let CAR = 5;
let DETECTION_THRESHOLD = 90;
let letter_counter = 0;
let previous_letter = '';
const FPS = 30; // Optimized FPS for stability

// DOM Elements
const video = document.querySelector("#videoElement");
const canvas = document.querySelector("#canvasOutput");
const img = document.getElementById("preview");
const live_letter = document.getElementById("live-letter");
const confidence = document.getElementById("confidence");
const interpreted_text = document.getElementById("interpreted-text");
const carSlider = document.getElementById('car');
const thresholdSlider = document.getElementById('threshold');

// Initialize settings from sliders
if (carSlider) CAR = carSlider.value;
if (thresholdSlider) DETECTION_THRESHOLD = thresholdSlider.value;

// Socket.IO Connection
const socket = io();

socket.on('connect', () => console.log("Connected to server!"));
socket.on('disconnect', () => console.log("Disconnected from server"));

// Camera Control
function RecordButton() {
    const btnIcon = document.querySelector('.btn-power i');
    if (!record) {
        record = true;
        stopVideoCapture();
        if (btnIcon) btnIcon.parentElement.classList.add('bg-secondary');
    } else {
        record = false;
        startVideoCapture();
        if (btnIcon) btnIcon.parentElement.classList.remove('bg-secondary');
    }
}

function startVideoCapture() {
    if (navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                videoStream = stream;
                video.srcObject = stream;
                video.play();
                processVideo(); // Restart processing
            })
            .catch(err => console.error("Camera access error:", err));
    }
}

function stopVideoCapture() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
}

// OpenCV Setup
video.width = 640;
video.height = 480;
canvas.width = video.width;
canvas.height = video.height;
const context = canvas.getContext('2d', { willReadFrequently: true });

let src, dst, cap;

// Wait for OpenCV to be ready
function onOpenCvReady() {
    src = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    dst = new cv.Mat(video.height, video.width, cv.CV_8UC4);
    cap = new cv.VideoCapture(video);
    startVideoCapture();
}

// Call when OpenCV finishes loading (if handled via script tag load)
if (typeof cv !== 'undefined' && cv.Mat) {
    onOpenCvReady();
} else {
    document.addEventListener('opencv-ready', onOpenCvReady);
}

function processVideo() {
    if (record || !videoStream) return;

    let begin = Date.now();
    try {
        cap.read(src);
        src.copyTo(dst);

        // Draw detection box
        const rectStart = new cv.Point(video.width - 150, 100);
        const rectEnd = new cv.Point(video.width - (150 + 200), (100 + 200));
        cv.rectangle(dst, rectStart, rectEnd, [99, 102, 241, 255], 3, cv.LINE_8, 0);

        cv.imshow("canvasOutput", dst);
    } catch (e) {
        console.error("Frame processing error:", e);
    }

    let delay = 1000 / FPS - (Date.now() - begin);
    setTimeout(processVideo, Math.max(0, delay));
}

// Frame transmission to Server
setInterval(() => {
    if (!record && videoStream) {
        try {
            const data = canvas.toDataURL("image/jpeg", 0.5).split(',')[1];
            socket.emit('image', data);
        } catch (e) { }
    }
}, 1000 / 10); // Send 10 frames per second for server-side processing

// Server Response Handling
socket.on('processed_frame', (data) => {
    if (img) img.src = 'data:image/jpeg;base64,' + data.frame;

    const score = (parseFloat(data.prediction_score) * 100).toFixed(2);

    if (score >= parseInt(DETECTION_THRESHOLD)) {
        confidence.className = 'small fw-bold text-success h4 mb-0';

        if (previous_letter === data.letter) {
            letter_counter++;
        } else {
            letter_counter = 0;
        }

        if (letter_counter > parseInt(CAR)) {
            if (data.letter === "space") {
                interpreted_text.value += " ";
            } else if (data.letter === "del") {
                interpreted_text.value = interpreted_text.value.slice(0, -1);
            } else {
                interpreted_text.value += data.letter;
            }
            letter_counter = 0;
            // Scroll to bottom
            interpreted_text.scrollTop = interpreted_text.scrollHeight;
        }
        previous_letter = data.letter;
    } else {
        confidence.className = 'small fw-bold text-muted h4 mb-0';
    }

    live_letter.innerText = data.letter || '--';
    confidence.innerText = score + '%';
});

// Settings Events
if (carSlider) {
    carSlider.addEventListener('input', () => {
        CAR = carSlider.value;
    });
}

if (thresholdSlider) {
    thresholdSlider.addEventListener('input', () => {
        DETECTION_THRESHOLD = thresholdSlider.value;
    });
}

