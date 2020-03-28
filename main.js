let video = null;
let canvas = null;
let ctx = null;

let model = null;

let hand = {
  position: [0, 0],
  size: 0,
  damage: 0,
  xController: null,
  yController: null,
  viruses: [],
};

let lastTime = 0;

let faceLeftImage = new Image();
faceLeftImage.src = 'images/face-left.png';
let faceRightImage = new Image();
faceRightImage.src = 'images/face-right.png';
let faceTopImage = new Image();
faceTopImage.src = 'images/face-top.png';
let faceBottomImage = new Image();
faceBottomImage.src = 'images/face-bottom.png';

let virusImage = new Image();
virusImage.src = 'images/virus.png';
let handImage = new Image();
handImage.src = 'images/hand.png';

let gameMenu = null;
let fade = null;
let timeText = null;
let highscoreText = null;

let highscore = 0;
let startTime = 0;

let faceTime = 2000;
function createFace() {
  return {
    image: null,
    side: 0,
    time: 0,

    update: function(deltaTime) {
    },
  };
}

function createVirus() {
  return {
    size: 0,
    position: [0, 0],
    velocity: [0, 0],

    update: function(deltaTime) {
      this.position[0] += this.velocity[0] * deltaTime;
      this.position[1] += this.velocity[1] * deltaTime;
    },
  };
}

let faces = [];
let viruses = [];
let coughInterval = 1000;
let lastCoughTime = 0;
let maxDamage = 3;

let started = false;

init();

function init() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');
  canvas.width = 640;
  canvas.height = 480;

  ctx = canvas.getContext('2d');

  gameMenu = document.querySelector('#menu');
  fade = document.querySelector('#fade');
  timeText = document.querySelector('#time');
  highscoreText = document.querySelector('#highscore');

  let oldHighscore = localStorage.getItem('highscore');
  if (oldHighscore) {
    highscore = JSON.parse(oldHighscore);
    highscoreText.innerHTML = 'Highscore: ' + highscore;
  }

  startButton = document.querySelector('#start-button');
  startButton.addEventListener('click', function() {
    start();
  });

  hand.size = 60;

  // Tune the PID controller with the following steps:
  // 1. Set all gains to zero.
  // 2. Increase the P gain until the response to a disturbance is steady oscillation.
  // 3. Increase the D gain until the the oscillations go away (i.e. it's critically damped).
  // 4. Repeat steps 2 and 3 until increasing the D gain does not stop the oscillations.
  // 5. Set P and D to the last stable values.
  // 6. Increase the I gain until it brings you to the setpoint with the number of oscillations
  //    desired (normally zero but a quicker response can be had if you don't mind a couple
  //    oscillations of overshoot)
  let controllerParams = {
    k_p: 80,
    k_i: 0,
    k_d: 0,
    dt: 1,
  };
  hand.xController = new Controller(controllerParams);
  hand.xController.setTarget(0);
  hand.yController = new Controller(controllerParams);
  hand.yController.setTarget(0);

  lastTime = Date.now();

  showMenu();

  const modelParams = {
    maxNumBoxes: 1,      // maximum number of boxes to detect
    iouThreshold: 0.5,    // ioU threshold for non-max suppression
    scoreThreshold: 0.6,  // confidence threshold for predictions
  };
  handTrack.load(modelParams).then(loadedModel => {
    model = loadedModel;
  });

  setTimeout(function() {
    handTrack.startVideo(video).then(function(status) {
      updateLoop();
      runDetection();
    });
  }, 1000);
}

function start() {
  faces = [];
  viruses = [];
  started = true;
  startTime = Date.now();
  hand.damage = 0;
  hand.position = [canvas.width / 2, canvas.height / 2];
  gameMenu.style.display = 'none';
  fade.style.display = 'none';
  timeText.style.display = 'block';
  hand.viruses = [];
}

function runDetection() {
  model.detect(video).then(predictions => {
    if (predictions.length > 0) {
      let box = predictions[0].bbox;
      let center = boxCenter(box);
      hand.xController.setTarget(center[0]);
      hand.yController.setTarget(center[1]);
    }

    setTimeout(runDetection, 1000 / 12);
  });
}

function updateLoop() {
  let time = Date.now();
  let deltaTime = (time - lastTime) / 1000;
  lastTime = time;

  for (let i = 0; i < viruses.length; ++i) {
    viruses[i].update(deltaTime);

    if (started &&
        dist(hand.position, viruses[i].position) < hand.size + viruses[i].size) {
      takeDamage();
      hand.viruses.push(viruses[i]);
      viruses[i].offset = [
        hand.position[0] - viruses[i].position[0],
        hand.position[1] - viruses[i].position[1],
      ];
      viruses.splice(i, 1);
    }
  }

  for (let i = 0; i < faces.length; ++i) {
    faces[i].update(deltaTime);
    if (Date.now() - faces[i].time >= faceTime) {
      faces.splice(i, 1);
    }
  }

  let xCorrection = hand.xController.update(hand.position[0]);
  let yCorrection = hand.yController.update(hand.position[1]);
  let scale = 0.01;
  hand.position[0] += xCorrection * scale;
  hand.position[1] += yCorrection * scale;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let colors = [
    'rgba(0,255,0,.5)',
    'rgba(127,180,0,.5)',
    'rgba(255,127,0,.5)',
    'rgba(255,0,0,.5)',
  ];
  // ctx.fillStyle = colors[hand.damage];
  // ctx.beginPath();
  // ctx.arc(hand.position[0], hand.position[1], hand.size, 0, 2 * Math.PI);
  // ctx.closePath();
  // ctx.fill();
  ctx.drawImage(handImage, hand.position[0] - hand.size,
      hand.position[1] - hand.size, hand.size * 2, hand.size * 2);
  for (let i = 0; i < hand.viruses.length; ++i) {
    let virus = hand.viruses[i];
    ctx.drawImage(virusImage, hand.position[0] - virus.size - virus.offset[0],
        hand.position[1] - virus.size - virus.offset[1], virus.size * 2, virus.size * 2);
  }

  for (let i = 0; i < viruses.length; ++i) {
    let virus = viruses[i];
    ctx.drawImage(virusImage, virus.position[0] - virus.size,
        virus.position[1] - virus.size, virus.size * 2, virus.size * 2);
  }

  for (let i = 0; i < faces.length; ++i) {
    let face = faces[i];
    switch (face.side) {
      case 0:
        ctx.drawImage(face.image, face.x, 0);
        break;
      case 1:
        ctx.drawImage(face.image, canvas.width - face.image.width, face.x);
        break;
      case 2:
        ctx.drawImage(face.image, face.x, canvas.height - face.image.height);
        break;
      case 3:
        ctx.drawImage(face.image, 0, face.x);
        break;
    }
  }

  if (Date.now() - lastCoughTime >= coughInterval) {
    randomCough();
    lastCoughTime = Date.now();
  }

  timeText.innerHTML = Math.floor((Date.now() - startTime) / 1000);

  requestAnimationFrame(updateLoop);
}

function randomCough() {
  let side = Math.floor(Math.random() * 4);
  let x;
  if (side === 0 || side === 2) {
    x = Math.random() * canvas.width;
  }
  if (side === 1 || side === 3) {
    x = Math.random() * canvas.height;
  }
  cough(x, side);
}

function cough(x, side) {
  var face = createFace();
  face.x = x;
  face.x -= side === 1 || side === 3 ? 130 : 70;
  face.side = side;
  face.time = Date.now();

  let virus = createVirus();
  virus.size = 30;
  let speed = 200;
  switch (side) {
    case 0:
      face.image = faceTopImage;
      virus.position = [x, -virus.size * 2];
      virus.velocity = [0, speed];
      break;
    case 1:
      face.image = faceRightImage;
      virus.position = [canvas.width, x];
      virus.velocity = [-speed, 0];
      break;
    case 2:
      face.image = faceBottomImage;
      virus.position = [x, canvas.height];
      virus.velocity = [0, -speed];
      break;
    case 3:
      face.image = faceLeftImage;
      virus.position = [-virus.size * 2, x];
      virus.velocity = [speed, 0];
      break;
  }
  faces.push(face);
  viruses.push(virus);
}

function boxCenter(box) {
  return [box[0] + box[2] / 2, box[1] + box[3] / 2];
}

function dist(a, b) {
  let dx = a[0] - b[0];
  let dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

function copyArray(array) {
  return array.slice();
}

function takeDamage() {
  ++hand.damage;
  if (hand.damage >= maxDamage) {
    corona();
  }
}

function corona() {
  started = false;
  let time = Math.floor((Date.now() - startTime) / 1000);
  if (time > highscore) {
    highscore = time;
    localStorage.setItem('highscore', highscore);
    highscoreText.innerHTML = 'Highscore: ' + time;
  }
  setTimeout(function() {
    showMenu();
  }, 1000);
}

function showMenu() {
  gameMenu.style.display = 'block';
  fade.style.display = 'block';
  timeText.style.display = 'none';
}
