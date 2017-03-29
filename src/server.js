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

const rooms = [];
const Users = {};
const Names = {};

const randColor = () => {
  const red = Math.floor((Math.random() * 255) + 0);
  return `rgb(${red}, ${255 - red}, ${Math.floor((Math.random() * 255) + 0)})`;
};

    // create a new room
const createNewRoom = () => {
  const newRoom = {
    roomName: `room${rooms.length}`,
    leader: 0,
    running: false,
    circleActive: false,
    circlePrepped: false,
    liveCircle: 0,
    Circles: {},
    UserIds: [],
    Set: {},  // settings
    Func: {},
  };
    // initialize default settings
  newRoom.Set.perRound = 10; // circles per round
  newRoom.Set.minInter = 1;  // min interval
  newRoom.Set.maxInter = 5;  // max interval
  newRoom.Set.range = newRoom.Set.maxInter - newRoom.Set.minInter;
  newRoom.Set.minP = 10;      // min points
  newRoom.Set.maxP = 100;     // max points
  newRoom.Set.missPenalty = 0;// miss penalty
  newRoom.Set.startS = 5.0;   // circle start size
  newRoom.Set.endS = 40.0;    // circle end size
  newRoom.Set.lifeTime = 5.0; // circle lifetime
  newRoom.Set.growthRate = (newRoom.Set.endS - newRoom.Set.startS) /
                            newRoom.Set.lifeTime; // circle growth rate

  newRoom.Func.growCircle = function () {
    newRoom.Circles[newRoom.liveCircle].rad += (newRoom.Set.growthRate / 10);
    if (newRoom.Circles[newRoom.liveCircle].rad >= newRoom.Set.endS) {
      newRoom.Circles[newRoom.liveCircle].color = 'rgb(50,50,50)';
      newRoom.circleActive = false;
    }
    io.sockets.in(newRoom.roomName).emit('updateCircles', { circle: newRoom.Circles[newRoom.liveCircle] });
  };

  // handle the end of a round
  newRoom.Func.endRound = function () {
    newRoom.leader = newRoom.UserIds[0];
    for (let i = 1; i < newRoom.UserIds.length; i++) {
        // make the player with the most points the leader
      if (Users[newRoom.UserIds[i]].points > Users[newRoom.leader].points) {
        newRoom.leader = newRoom.UserIds[i];
      }
        // remove spectator mode for players who entered mid-game
      if (Users[newRoom.UserIds[i]].spect) {
        Users[newRoom.UserIds[i]].spect = false;
        io.sockets.in(newRoom.roomName).emit('updateUsers', { user: Users[newRoom.UserIds[i]] });
      }
    }
    io.sockets.in(newRoom.roomName).emit('end', { winner: newRoom.leader });
    io.sockets.in(newRoom.roomName).emit('updateRoom', { room: newRoom });
  };
    // start a new circle
  newRoom.Func.newCircle = function () {
    console.log(newRoom.circleActive);
    newRoom.circleActive = true;
    newRoom.circlePrepped = false;
    newRoom.Circles[newRoom.liveCircle] = {
      num: newRoom.liveCircle,
      x: Math.floor(Math.random() * 600) + 20,
      y: Math.floor(Math.random() * 440) + 20,
      rad: newRoom.Set.startS,
      color: 'black' };
    io.sockets.in(newRoom.roomName).emit('updateCircles', { circle: newRoom.Circles[newRoom.liveCircle] });
    console.log(newRoom.Circles[newRoom.liveCircle]);
  };
    // manage when circles are created and grow
  newRoom.Func.circleManager = function () {
    if (newRoom.running) {
      if (newRoom.circleActive) {
        newRoom.Func.growCircle();
      } else if (!newRoom.circlePrepped) {
        newRoom.circlePrepped = true;
        newRoom.liveCircle++;

        if (newRoom.liveCircle >= newRoom.Set.perRound) {
          newRoom.running = false;
          newRoom.Func.endRound();
        } else {
          setTimeout(
                newRoom.Func.newCircle,
                Math.floor(1000 * ((Math.random() * newRoom.Set.range) + newRoom.Set.minInter)));
        }
      }
    }
  };

  rooms.push(newRoom);
  setInterval(rooms[rooms.length - 1].Func.circleManager, 100);
  return (rooms.length - 1);
};


const onJoin = (sock) => {
  const socket = sock;

  socket.on('join', () => {
    socket.uid = userNum;
    userNum++;

    // find a room that isn't full or make a new one
    socket.rNum = rooms.findIndex(room => room.UserIds.length < 5);
    if (socket.rNum === -1) {
      socket.rNum = createNewRoom();
    }
    rooms[socket.rNum].UserIds.push(socket.uid);
    if (rooms[socket.rNum].UserIds.length === 1) {
      rooms[socket.rNum].leader = socket.uid;
    }
    socket.roomName = `${rooms[socket.rNum].roomName}`;

    socket.join(socket.roomName);
    // add user to users
    Users[socket.uid] = { id: socket.uid, color: randColor(), name: `player ${socket.uid}`, room: socket.rNum, points: 0, spect: true };
    // initialize user as a spectator unless between games
    if (!rooms[socket.rNum].running) {
      Users[socket.uid].spect = false;
    }
    // add name to indicate it is taken
    Names[Users[socket.uid].name] = socket.uid;
    // give the client the state of the server
    socket.emit('syncClient', { id: socket.uid, Circles: rooms[socket.rNum].Circles, Users, rooms, roomNum: socket.rNum });

    // send new user's data to all clients
    io.sockets.in(socket.roomName).emit('updateUsers', { user: Users[socket.uid] });
    io.sockets.in(socket.roomName).emit('updateRoom', { room: rooms[socket.rNum] });
    io.sockets.in(socket.roomName).emit('newMessage', { message: `${Users[socket.uid].name} joined ${socket.roomName}`, color: "black"});
    console.log(`someone joined ${socket.roomName}`);
  });

  // remove users if they leave
  socket.on('disconnect', () => {
    socket.leave(socket.roomName);
    delete Names[Users[socket.uid].name];
    delete Users[socket.uid];
    rooms[socket.rNum].UserIds.splice(rooms[socket.rNum].UserIds.indexOf(socket.uid), 1);
    if (rooms[socket.rNum].UserIds.length > 0) {
      if (socket.uid === rooms[socket.rNum].leader) {
        rooms[socket.rNum].leader = rooms[socket.rNum].UserIds[0];
        io.sockets.in(socket.roomName).emit('newMessage', { message: `${rooms[socket.rNum].leader} is new leader`, color: "black"});
        console.log(`${rooms[socket.rNum].leader} is new leader`);
        io.sockets.in(socket.roomName).emit('updateRoom', { room: rooms[socket.rNum] });
      }
    } else {
      rooms[socket.rNum].leader = -1;
    }
    io.sockets.in(socket.roomName).emit('removeUser', { id: socket.uid });
    console.log('someone left');
  });
  
  socket.on('sendMessage', (data) => {
    
    const newMessage = data.message.replace(/</g, '&lt;');
    io.sockets.in(socket.roomName).emit('newMessage', { message: `${Users[socket.uid].name}: ${newMessage}`, color: Users[socket.uid].color});
    
  });

  // get a click on the canvas
  socket.on('click', (data) => {
    console.log('click');
        // check if spectator mode
    if (!Users[socket.uid].spect) {
      if (rooms[socket.rNum].circleActive) {
            // check collision with active circle
        const testCircle = rooms[socket.rNum].Circles[rooms[socket.rNum].liveCircle];
            // find distance squared
        const distSq = ((data.x - testCircle.x) *
                          (data.x - testCircle.x)) +
                         ((data.y - testCircle.y) *
                          (data.y - testCircle.y));
        if ((testCircle.rad *
               testCircle.rad) >= distSq) {
          rooms[socket.rNum].circleActive = false;
                // change circle color
          rooms[socket.rNum].Circles[rooms[socket.rNum].liveCircle].color = Users[socket.uid].color;
                // increment points
          Users[socket.uid].points += rooms[socket.rNum].Set.minP +
                    ((rooms[socket.rNum].Set.maxP - rooms[socket.rNum].Set.minP) *
                     (1 - ((testCircle.rad - rooms[socket.rNum].Set.startS) /
                    (rooms[socket.rNum].Set.endS - rooms[socket.rNum].Set.startS))));
                // update clients
          io.sockets.in(socket.roomName).emit('updateCircles', { circle: rooms[socket.rNum].Circles[rooms[socket.rNum].liveCircle] });
          io.sockets.in(socket.roomName).emit('updateUsers', { user: Users[socket.uid] });
          console.log(`${socket.uid} won circle ${rooms[socket.rNum].liveCircle}`);
        } else {
          Users[socket.uid].points -= rooms[socket.rNum].Set.missPenalty;
          io.sockets.in(socket.roomName).emit('updateUsers', { user: Users[socket.uid] });
        }
      }
    } else {
      socket.emit('denied', { message: 'server: spectators cannot clik circles', code: 'spect' });
    }
  });

  // start round
  socket.on('start', () => {
    if (rooms[socket.rNum].leader === socket.uid) {
      console.log('start');
      if (!rooms[socket.rNum].running) {
        rooms[socket.rNum].running = true;
        rooms[socket.rNum].circleActive = false;
        rooms[socket.rNum].liveCircle = 0;
        rooms[socket.rNum].Circles = {};
        for (let i = 0; i < rooms[socket.rNum].UserIds.length; i++) {
          Users[rooms[socket.rNum].UserIds[i]].points = 0;
        }

        io.sockets.in(socket.roomName).emit('reset', { Circles: rooms[socket.rNum].Circles, Users });
        if (!rooms[socket.rNum].circleActive) {
          rooms[socket.rNum].Func.newCircle();
        }
      }
    } else {
      socket.emit('denied', { message: 'server: only the leader can start a round', code: 'lead' });
    }
  });

  // change settings
  socket.on('changeSettings', (data) => {
    if (rooms[socket.rNum].leader !== socket.uid) {
        // check if leader
      socket.emit('denied', { message: 'only the leader can change settings', code: 'sett' });
    } else if (rooms[socket.rNum].running) {
        // check if game is running
      socket.emit('denied', { message: 'settings locked during round', code: 'sett' });
    } else {
      const newSet = data;
      let validated = true;
      const keys = Object.keys(newSet);
      for (let i = 0; i < keys.length; i++) {
            // fill empty params with existing values
        if (newSet[keys[i]] === null) {
          newSet[keys[i]] = rooms[socket.rNum].Set[keys[i]];
        }
            // check if negative
        if (newSet[keys[i]] < 0) {
          validated = false;
        }
      }
      // check if invalid
      if (newSet.perRound === 0 ||
            newSet.minInter >= newSet.maxInter ||
            newSet.minP >= newSet.maxP ||
            newSet.startS >= newSet.endS) {
        validated = false;
      }
      if (validated) {
        newSet.range = newSet.maxInter - newSet.minInter;
        newSet.growthRate = (newSet.endS - newSet.startS) / newSet.lifeTime;
        rooms[socket.rNum].Set = newSet;
        io.sockets.in(socket.roomName).emit('updateSettings', { settings: rooms[socket.rNum].Set });
      } else {
        socket.emit('denied', { message: 'server: one or more invalid settings', code: 'sett' });
      }
    }
  });

  socket.on('changeName', (data) => {
      // sanitize a bit
    const newName = data.name.replace(/</g, '&lt;');
    console.log(newName);
    if (newName === '') {
      socket.emit('denied', { message: 'server: cannot have empty name', code: 'name' });
    } else if (Names[newName] != null) {
      socket.emit('denied', { message: 'server: name already taken', code: 'name' });
    } else {
        // remove old name
      delete Names[Users[socket.uid].name];
        // add new name
      Names[newName] = socket.uid;
        // set new name
      Users[socket.uid].name = newName;
        // update clients
      io.sockets.in(socket.roomName).emit('updateUsers', { user: Users[socket.uid] });
    }
  });
};

io.sockets.on('connection', (socket) => {
  onJoin(socket);
  console.log('connection');
});


console.log('Websocket server started');
