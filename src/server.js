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
let leader = 0;
let running = false;
let circleActive = false;
let circlePrepped = false;
let liveCircle = 0;
let Circles = {};
const Users = {};
const Set = {};  // settings

// initialize default settings
Set.perRound = 10;
Set.minInter = 1;
Set.maxInter = 5;
Set.range = Set.maxInter - Set.minInter;
// minPoints + maxPoints
Set.minP = 10;
Set.maxP = 100;
Set.missPenalty = 0;
// startSize + endSize
Set.startS = 5.0;
Set.endS = 40.0;
Set.lifeTime = 5.0;
Set.growthRate = (Set.endS - Set.startS) / Set.lifeTime;


const randColor = () => `rgb(${Math.floor(Math.random() * 255)}, 
                             ${Math.floor(Math.random() * 255)}, 
                             ${Math.floor(Math.random() * 255)})`;

const growCircle = () => {
  Circles[liveCircle].rad += (Set.growthRate / 10);
  io.sockets.in('room1').emit('updateCircles', { circle: Circles[liveCircle] });
  if (Circles[liveCircle].rad >= Set.endS) {
    circleActive = false;
  }
};

const endRound = () => {
    let keys = Object.keys(Users);
    leader = keys[0];
      for(let i = 1; i < keys.length; i++){
        if (Users[keys[i]].points > Users[leader].points) {
          leader = keys[i];
        }
      }
    io.sockets.in('room1').emit('end', { winner: leader });
}

// start a new circle
const newCircle = () => {
  circleActive = true;
  circlePrepped = false;
  Circles[liveCircle] = { num: liveCircle,
    x: Math.floor(Math.random() * 600) + 20,
    y: Math.floor(Math.random() * 440) + 20,
    rad: Set.startS,
    color: 'black' };
  io.sockets.in('room1').emit('updateCircles', { circle: Circles[liveCircle] });
  console.log(Circles[liveCircle]);
};

const circleManager = () => {
  if (running) {
    if (circleActive) {
      growCircle();
    } else if (!circlePrepped) {
      circlePrepped = true;
      liveCircle++;

      if (liveCircle >= Set.perRound) {
        running = false;
        endRound();
      } else {
        setTimeout(
            newCircle,
            Math.floor(1000 * ((Math.random() * Set.range) + Set.minInter)));
      }
    }
  }
};

const onJoin = (sock) => {
  const socket = sock;


  socket.on('join', () => {
    socket.uid = userNum;
    userNum++;
    socket.join('room1');
    // initialize user as a spectator unless between games
    Users[socket.uid] = { id: socket.uid, color: randColor(), name: `player ${socket.uid}`, points: 0, spect: true };
    if (!running) {
      Users[socket.uid].spect = false;
    }
    // give the client the state of the server
    socket.emit('syncClient', { id: socket.uid, Circles, Users });

    // send new user's data to all clients
    io.sockets.in('room1').emit('updateUsers', { user: Users[socket.uid] });
    console.log('someone joined');
  });

  // remove users if they leave
  socket.on('disconnect', () => {
    socket.leave('room1');
    delete Users[socket.uid];
    if (socket.uid === leader){
        leader = Object.keys(Users)[0];
        console.log(leader + " is new leader");
    }
    io.sockets.in('room1').emit('removeUser', { id: socket.uid });
    console.log('someone left');
  });

  // get a click on the canvas
  socket.on('click', (data) => {
    console.log('click');
      // check collision with active circle
    if (circleActive) {
      const distSq = ((data.x - Circles[liveCircle].x) * (data.x - Circles[liveCircle].x)) +
                        ((data.y - Circles[liveCircle].y) * (data.y - Circles[liveCircle].y));
      if ((Circles[liveCircle].rad * Circles[liveCircle].rad) >= distSq) {
        circleActive = false;
            // change circle color
        Circles[liveCircle].color = Users[socket.uid].color;
            // increment points
        Users[socket.uid].points += Set.minP + ((Set.maxP - Set.minP) *
                (1 - ((Circles[liveCircle].rad - Set.startS) / (Set.endS - Set.startS))));
            // update clients
        io.sockets.in('room1').emit('updateCircles', { circle: Circles[liveCircle] });
        io.sockets.in('room1').emit('updateUsers', { user: Users[socket.uid] });
        console.log(`${socket.uid} won circle ${liveCircle}`);
      } else {
        Users[socket.uid].points -= Set.missPenalty;
        io.sockets.in('room1').emit('updateUsers', { user: Users[socket.uid] });
      }
    }
  });

  // start round
  socket.on('start', () => {
    console.log('start');
    if (!running) {
      running = true;
      circleActive = false;
      liveCircle = 0;
      Circles = {};
      const keys = Object.keys(Users);
      for (let i = 0; i < keys.length; i++) {
        Users[keys[i]].points = 0;
      }

      io.sockets.in('room1').emit('reset', { Circles, Users });
      if (!circleActive) {
        newCircle();
      }
    }
  });

  // change settings
  socket.on('changeSettings', () => {
    io.sockets.in('room1').emit('updateSettings');
  });
};

io.sockets.on('connection', (socket) => {
  onJoin(socket);
  console.log('connection');
});


console.log('Websocket server started');
setInterval(circleManager, 100);
