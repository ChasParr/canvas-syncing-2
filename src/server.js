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

let num = 0;
const squares = {};

const onJoin = (sock) => {
  const socket = sock;

  socket.on('join', () => {
    socket.join('room1');
    squares[num] = { x: 100, y: 100, width: 50, height: 50, color: 'black' };
    socket.emit('syncClient', { id: num, squares });
    io.sockets.in('room1').emit('update', { id: num, coords: squares[num] });
    num++;
    console.log('someone joined');
  });

  socket.on('move', (data) => {
    squares[data.id].x += data.xMove * 10;
    squares[data.id].y += data.yMove * 10;
    io.sockets.in('room1').emit('update', { id: data.id, coords: squares[data.id] });
    console.log(`${data.id} moved`);
  });
};

io.sockets.on('connection', (socket) => {
  onJoin(socket);
});


console.log('Websocket server started');
