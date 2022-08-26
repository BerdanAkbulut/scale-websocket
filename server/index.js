const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const port = process.env.PORT || 3000;
const serverName = process.env.NAME || 'Unknown';

const pubClient = createClient({ host: 'redis', port: 6379 });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));

const { RedisSessionStore } = require('./sessionStore');

const sessionStore = new RedisSessionStore(pubClient);

//for sessionID
const crypto = require('crypto');
const randomId = () => crypto.randomBytes(8).toString('hex');

//middleware
io.use(async (socket, next) => {
  const sessionID = socket.handshake.auth.sessionID;
  if (sessionID) {
    const session = await sessionStore.findSession(sessionID);
    if (session) {
      socket.sessionID = sessionID;
      socket.userID = session.userID;
      socket.username = session.username;
      return next();
    }
  }
  const { username, userID } = socket.handshake.auth;
  // const username = socket.handshake.auth.username;
  if (!username || !userID) {
    return next(new Error('userId or username not exist'));
  }

  socket.sessionID = randomId();
  socket.userID = userID;
  socket.username = username;
  next();
});
///

io.on('connection', async (socket) => {
  // persist session
  sessionStore.saveSession(socket.sessionID, {
    userID: socket.userID,
    username: socket.username,
    connected: true,
  });

  // emit session details
  socket.emit('session', {
    sessionID: socket.sessionID,
    userID: socket.userID,
  });

  // join the "userID" room
  socket.join(socket.userID);

  // fetch existing users
  const users = [];

  // const sessionID = socket.handshake.auth.sessionID;

  // const ss = await sessionStore.findSession(sessionID);

  // console.log('my session', ss);

  // try {
  //   console.log(await sessionStore.findAllSessions());

  //   sessions.forEach((session) => {
  //     users.push({
  //       userID: session.userID,
  //       username: session.username,
  //       connected: session.connected,
  //     });
  //   });
  //   socket.emit('users', users);

  //   // notify existing users
  //   socket.broadcast.emit('user connected', {
  //     userID: socket.userID,
  //     username: socket.username,
  //     connected: true,
  //   });
  // } catch (e) {
  //   console.log('session errorrrr', e);
  // }

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on('private message', ({ content, to }) => {
    const message = {
      content,
      from: socket.userID,
      to,
    };
    socket.to(to).to(socket.userID).emit('private message', message);
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      username: socket.username,
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.username,
    });
  });

  // notify users upon disconnection
  socket.on('disconnect', async () => {
    const matchingSockets = await io.in(socket.userID).allSockets();
    const isDisconnected = matchingSockets.size === 0;
    if (isDisconnected) {
      // notify other users
      socket.broadcast.emit('user disconnected', socket.userID);
      // update the connection status of the session
      sessionStore.saveSession(socket.sessionID, {
        userID: socket.userID,
        username: socket.username,
        connected: false,
      });
    }
  });
});

server.listen(port, () => {
  console.log('Server listening at port %d', port);
  console.log("Hello, I'm %s, how can I help?", serverName);
});

// // Routing
// app.use(express.static(__dirname + '/public'));

// Chatroom
