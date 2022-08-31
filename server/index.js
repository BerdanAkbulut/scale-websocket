//const express = require('express');
//const app = express();
//const server = require('http').createServer(app);
//const io = require('socket.io')(server);

port = process.env.PORT || 3000;
const serverName = process.env.NAME || 'Unknown';

const { Server } = require('socket.io');
const io = new Server(port, {
  cors: {
    origin: ['*', '*:*'],
    credentials: true,
  },
});

const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

// clients for pub/sub system
const pubClient = new Redis({ host: 'redis', port: 6379 });
const subClient = pubClient.duplicate();

// client for socket sessions persistence (on client page refresh , connection breaks)
const sessionClient = new Redis({ host: 'redisses', port: 6377 });

// - -
// const pubClient = createClient({ host: 'redis', port: 6379 });
// const subClient = pubClient.duplicate();
//const sessionClient = createClient({ host: 'redisses', port: 6377 });

io.adapter(createAdapter(pubClient, subClient));

sessionClient.on('connect', () => {
  console.log('redis session client connected');
});

//for sessionID
const crypto = require('crypto');
const randomId = () => crypto.randomBytes(8).toString('hex');

const { RedisSessionStore } = require('./sessionStore');
const sessionStore = new RedisSessionStore(sessionClient);

// try {
//   sessionStore.saveSession(123, {
//     userID: 345,
//     connected: true,
//     username: 'ali',
//   });
// } catch (e) {
//   console.error(e);
// }

// const getUsers = async () => {
//   try {
//     const user = await sessionStore.findSession(123);
//     console.log(user);
//     // const bedo =  sessionClient.get('key:3');
//     // console.log('bedo geldimi ? *??', bedo);
//   } catch (e) {
//     console.error(e);
//   }
// };
// getUsers();

//middleware  -  client should be store own connection on the browser (sessionStorage, localstroge vb.) and we take that session if it is exists. if it is not , then we ll create one.
io.use(async (socket, next) => {
  const { userId, userName } = socket.handshake.auth;
  console.log('USER ID', userId);
  console.log('USER ID', userName);

  if (userId) {
    const session = await sessionStore.findSession(userId);

    if (session) {
      console.log('yes, i will use old session?');
      socket.userId = userId;
      socket.userName = session.userName;
      socket.sessionId = session.sessionId;
      return next();
    } else {
      console.log('no session');
      socket.sessionId = randomId();
      socket.userId = userId;
      socket.userName = userName;
      return next();
    }
  }

  if (!userName || !userId) {
    return next(new Error('userId or username not exist'));
  }
});

io.on('connection', async (socket) => {
  // persist session
  sessionStore.saveSession(socket.userId, {
    userId: socket.userId,
    userName: socket.userName,
    connected: true,
  });

  // sessions.forEach((session) => {
  //   // if current user already has a session
  //   if (parseInt(session.userId) === parseInt(socket.userID)) {
  //     sessionStore.saveSession(session.sessionID, {
  //       userID: socket.userId,
  //       username: socket.username,
  //       connected: true,
  //     });
  //     return;
  //   }
  //   //  if not
  //   sessionStore.saveSession(socket.sessionID, {
  //     userID: socket.userID,
  //     username: socket.username,
  //     connected: true,
  //   });
  // });
  //emit session details
  socket.emit('session', {
    sessionID: socket.sessionId,
    userId: socket.userId,
  });

  // join the "userID" room  -- every connected user listens own userId , when we send message or receive a message we ll use userIds
  socket.join(socket.userId); // user joined own room which named own

  // socket.on('test r', (data) => {
  //   console.log('geldi mi', data);
  //   //socket.emit('test r', data.content);
  //   io.sockets.in(socket.userID).emit('test r', data.content);
  // });

  // fetch existing users
  const [sessions] = await Promise.all([sessionStore.findAllSessions()]);

  const users = [];

  sessions.forEach((session) => {
    users.push({
      userId: session.userId,
      userName: session.userName,
      connected: session.connected,
    });
  });

  socket.emit('users', users);

  // notify existing users
  socket.broadcast.emit('user connected', {
    userId: socket.userId,
    userName: socket.userName,
    connected: true,
  });

  // forward the private message to the right recipient (and to other tabs of the sender)
  socket.on('private message', ({ content, to }) => {
    console.log('content', content);
    console.log('to', to);

    const message = {
      content,
      from: socket.userId,
      to,
    };
    socket.to(to).to(socket.userId).emit('private message', message);
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', ({ to }) => {
    socket
      .to(to)
      .to(socket.userId)
      .emit('typing', { message: `yazıyor...`, to, from: socket.userId });
      
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      username: socket.userName,
    });
  });

  // notify users upon disconnection
  socket.on('disconnect', async () => {
    const matchingSockets = await io.in(socket.userId).allSockets();
    const isDisconnected = matchingSockets.size === 0;
    if (isDisconnected) {
      // notify other users
      socket.broadcast.emit('user disconnected', socket.userId);

      // update the connection status of the session
      sessionStore.saveSession(socket.userId, {
        userId: socket.userId,
        userName: socket.userName,
        connected: false,
      });
    }
  });
});

// server.listen(port, () => {
//   console.log('Server listening at port %d', port);
//   console.log("Hello, I'm %s, how can I help?", serverName);
// });

// // Routing
// app.use(express.static(__dirname + '/public'));

// Chatroom
