const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
//const mongoose = require('mongoose');

const port = process.env.PORT || 3000;
const serverName = process.env.NAME || 'Unknown';

const pubClient = createClient({ host: 'redis', port: 6379 });
const subClient = pubClient.duplicate();

const sessionClient = createClient({ host: 'redisses', port: 6377 });

sessionClient.on('connect', () => {
  console.log('reds session connected');
});

io.adapter(createAdapter(pubClient, subClient));

//for sessionID
const crypto = require('crypto');
const randomId = () => crypto.randomBytes(8).toString('hex');

const { RedisSessionStore } = require('./sessionStore');
const sessionStore = new RedisSessionStore(sessionClient);

try {
  sessionStore.saveSession(123, {
    userID: 345,
    connected: true,
    username: 'ali',
  });
  // sessionClient.set("key:3", "value3new")
  // console.log('eklendi');
} catch (e) {
  console.error(e);
}

const getUsers = async () => {
  try {
    const user = await sessionStore.findAllSessions();
    console.log(` all users ${user}`);
    // const bedo =  sessionClient.get('key:3');
    // console.log('bedo geldimi ? *??', bedo);
  } catch (e) {
    console.error(e);
  }
};

getUsers();
// const connectMongo = async () => {
//   await mongoose.connect('mongodb://mongo:27017');

//   const sessionSchema = new mongoose.Schema({
//     name: String,
//   });

//   const Kitten = mongoose.model('Session', sessionSchema);

//   const sessn = await Kitten.create({ name: 'BEDO' });
//   const allssn = await Kitten.find();
//   console.log(allssn);
// };
// connectMongo();

//middleware
// io.use(async (socket, next) => {
//   const sessionID = 123
//   //socket.handshake.auth.sessionID;
//   if (sessionID) {
//    // const session = await sessionStore.findSession(sessionID);
//     console.log('session id found', sessionID);
//     if (sessionID) {
//       socket.sessionID = sessionID;
//       socket.userID = session.userID;
//       socket.username = session.username;
//       return next();
//     }
//   }
//   const { username, userID } = socket.handshake.auth;
//   // const username = socket.handshake.auth.username;
//   if (!username || !userID) {
//     return next(new Error('userId or username not exist'));
//   }

//   socket.sessionID = randomId();
//   socket.userID = userID;
//   socket.username = username;
//   next();
// });
///

io.on('connection', async (socket) => {
  // persist session
  // sessionStore.saveSession(socket.sessionID, {
  //   userID: socket.userID,
  //   username: socket.username,
  //   connected: true,
  // });

  // emit session details
  // socket.emit('session', {
  //   sessionID: socket.sessionID,
  //   userID: socket.userID,
  // });

  socket.emit('users', 'ÜST');

  // join the "userID" room  -- every connected user listens own userId , when we send message or receive a message we ll use userIds
  //socket.join(socket.userID);  // user joined own room which named own

  socket.on('test r', (data) => {
    console.log('geldi mi', data);
    //socket.emit('test r', data.content);
    io.sockets.in(socket.userID).emit('test r', data.content);
  });

  // socket.join(socket.userID);
  // socket.to(socket.userID).emit('message to room', 'message to room');

  // fetch existing users
  const users = [];
  // const [messages, sessions] = await Promise.all([
  //   messageStore.findMessagesForUser(socket.userID),
  //   sessionStore.findAllSessions(),
  // ]);

  // const messagesPerUser = new Map();

  // messages.forEach((message) => {
  //   const { from, to } = message;
  //   const otherUser = socket.userID === from ? to : from;
  //   if (messagesPerUser.has(otherUser)) {
  //     messagesPerUser.get(otherUser).push(message);
  //   } else {
  //     messagesPerUser.set(otherUser, [message]);
  //   }
  // });

  // sessions.forEach((session) => {
  //   users.push({
  //     userID: session.userID,
  //     username: session.username,
  //     connected: session.connected,
  //     messages: messagesPerUser.get(session.userID) || [],
  //   });
  // });

  socket.emit('users', 'ALT');

  // // notify existing users
  // socket.broadcast.emit('user connected', {
  //   userID: socket.userID,
  //   username: socket.username,
  //   connected: true,
  //   messages: [],
  // });

  // fetch existing users

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
    socket.emit('private message', message);
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
