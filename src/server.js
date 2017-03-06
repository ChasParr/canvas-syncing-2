const http = require('http');
const fs = require('fs');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const index = fs.readFileSync(`${__dirname}/../client/index.html`);

const onRequest = (request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.write(index);
  response.end();
};

const app = http.createServer(onRequest).listen(port);

console.log(`Listening on 127.0.0.1: ${port}`);

const io = socketio(app);

let userNum = 0;
let running = false;
let circleActive = false;
let liveCircle = 0;
let Circles = {};
const Users = {};


// obviously flawed but should work good enough
const randColor = () => `#${Math.floor(Math.random() * 999999)}`;

const newCircle = () => {
  Circles[liveCircle] = { num: liveCircle,
    x: Math.floor(Math.random() * 600) + 20,
    y: Math.floor(Math.random() * 440) + 20,
    rad: 25,
    color: 'black' };
  io.sockets.in('room1').emit('updateCircles', { circle: Circles[liveCircle] });
  console.log(Circles[liveCircle]);
};

const onJoin = (sock) => {
  const socket = sock;

  socket.on('join', () => {
    socket.join('room1');
    Users[userNum] = { id: userNum, color: randColor(), name: `player ${userNum}`, points: 0, spect: true };
    if (!running) {
      Users[userNum].spect = false;
    }
    socket.emit('syncClient', { id: userNum, Circles, Users });

    io.sockets.in('room1').emit('updateUsers', { user: Users[userNum] });
    userNum++;
    console.log('someone joined');
  });

  socket.on('click', (data) => {
    console.log('click');
      // check collision with active circle
    if (circleActive){
        const distSq = ((data.x - Circles[liveCircle].x) * (data.x - Circles[liveCircle].x)) +
                        ((data.y - Circles[liveCircle].y) * (data.y - Circles[liveCircle].y));
        if ((Circles[liveCircle].rad * Circles[liveCircle].rad) >= distSq) {
          circleActive = false;
            // change circle color
          Circles[liveCircle].color = Users[data.id].color;
            // increment points
          Users[data.id].points++;
            // update clients
          io.sockets.in('room1').emit('updateCircles', { circle: Circles[liveCircle] });
          io.sockets.in('room1').emit('updateUsers', { user: Users[data.id] });
          console.log(`${data.id} won circle ${liveCircle}`);
          liveCircle++;
          if (liveCircle > 10) {
            running = false;
          } else {
            newCircle();
            circleActive = true;
          }
        }
    }
  });

  socket.on('start', () => {
    console.log('start');
    if (!running) {
      running = true;
      circleActive = false;
      liveCircle = 0;
      Circles = {};
      let keys = Object.keys(Users);
        for(let i = 0; i < keys.length; i++){
            Users[i].points = 0;
        }

      io.sockets.in('room1').emit('reset', { Circles, Users });
      if (!circleActive) {
        newCircle();
        circleActive = true;
      }
    }
  });
};

io.sockets.on('connection', (socket) => {
  onJoin(socket);
  console.log('1');
});


console.log('Websocket server started');
