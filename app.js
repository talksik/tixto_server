var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');

const webhoseio = require('webhoseio');

const client = webhoseio.config({token: 'cbbf0b09-1a00-4b07-81ef-c2c6233dd481'});

var news;

client.query('filterWebContent', {q: "language:english site_type:news site:cnn.com"}) // grabbing only from cnn
  .then(output => {
    console.log(output['totalResults']);

    var posts = output['posts'];
    console.log(posts.length);
    // 100
    news = posts.slice(0, 11); // going to send only 10 to frontend
});


var Twit = require('twit');
var config = require('./config/twitter.js');
var T = new Twit(config);

var params = {
  q: 'akshay',
  count: 2
  } // this is the param variable which will have key and value
//T.get('search/tweets', params,searchedData);
function searchedData(err, data, response) {
  if (err) console.log(err);
  console.log(data);
} // searchedData function is a callback function which

var db_config = {
  host: 'us-cdbr-iron-east-04.cleardb.net',
  user: 'bc7fa7fdf1822b',
  password: 'f62b55b3',
  database: 'heroku_99e764eb3c2ab7e'
};

var con;

var port = process.env.PORT || 3000;
server.listen(port, () => console.log('serving on port: ' + port));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

function handleDisconnect() {
  con = mysql.createConnection(db_config); // Recreate the connection, since
                                           // the old one cannot be reused.

  con.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      console.log('error when connecting to db', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  con.on('error', function(err) {
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}
handleDisconnect();


io.on('connection', function (socket) {
  console.log('Client connected: ' + socket.id);

  /*
  *  Client sends a request with its position and avatar link
  *  Returns the inital messages and assigned user_id
  */
  socket.on('initial', (input) => {
    console.log('Position: ' + input.position.long + ' ' + input.position.lat);
    let long = input.position.long;
    let lat = input.position.lat;

    var sql = 'SELECT * FROM users, messages WHERE messages.user_id = users.id HAVING (6371393 * acos(cos(radians((?))) * cos(radians(messages.lat)) * cos(radians(messages.lng) - radians((?))) + sin(radians((?))) * sin(radians(messages.lat))) < 300) ORDER BY messages.id'
    con.query(sql, [lat, long, lat], function (err, result, fields) {
      if (err) throw err;

      socket.emit('initMessages', result);
      console.log('Sent all ' + result.length + ' initial messages!');
    });

    // temporarily sending the news messages to users on initial
    socket.emit('initNews', news);
  });


  socket.on('userId', (input) => {
    let user_id = input.user_id;
    let newUser = input.newUser;
    let lat = input.position.lat;
    let lng = input.position.long;
    let avatar = input.avatar;
    let active = 1;
    let socket_id = socket.id;

    if (!newUser) {
      var updateSocketId = 'UPDATE users SET avatar=(?), lat=(?), lng=(?), active=(?), last_socket_id=(?) WHERE id=(?)';

      con.query(updateSocketId, [avatar, lat, lng, active, socket_id, user_id], function (err, result, fields) {
        if (err) throw err;
        console.log('Already user in: ' + user_id);
      });
    } else {
      var newUserSql = 'INSERT INTO users (avatar, lat, lng, active, last_socket_id) VALUES (?, ?, ?, ?, ?)';

      con.query(newUserSql, [avatar, lat, lng, active, socket_id], function (err, result, fields) {
        if (err) throw err;
        if (result) {
          var user_id = result.insertId;
          console.log("User id given: " + user_id);

          socket.emit("getNewUserId", {user_id: user_id});
        }
      });
    }
  });


  socket.on('newUserId', (input) => {
    let lat = input.position.lat;
    let lng = input.position.long;
    let avatar = input.avatar;
    let active = 1;
    let socket_id = socket.id;


  });


  socket.on('newMessage', function(msg) {
    var sql = "INSERT INTO messages (lat, lng, text, user_id) VALUES (?, ?, ?, ?)";
    var currTime = new Date().toString();
    // check validity of grabbing this info from msg itself rather than users and messages tables
    let user_id = msg.user_id;
    let text = msg.text;
    let lat = msg.lat;
    let lng = msg.long;
    let avatar = msg.avatar;
    let socket_id = socket.id;

    con.query(sql, [lat, lng, text, user_id], function(err, result, fields) {
      if (err) throw err;

      var msgId = result.insertId;
      console.log('Message with id ' + msgId + ' inserted into DB!');

      var uploadedMsg = {
        id: msgId,
        user_id: user_id,
        text: text,
        created: currTime,
        long: lng,
        lat: lat,
        avatar: avatar
      };

      var findUsersNear = 'SELECT * FROM users WHERE active=(?) HAVING (6371393 * acos(cos(radians((?))) * cos(radians(lat)) * cos(radians(lng) - radians((?))) + sin(radians((?))) * sin(radians(lat))) < 300) ORDER BY id';

      con.query(findUsersNear, [1, lat, lng, lat], function (err, result, fields) {
        if (err) throw err;

        result.map((user) => {
          io.to(user.last_socket_id).emit('newMessage', uploadedMsg);
        });

        console.log('Sent to all active users nearby!');
      });
    });
  });

  socket.on('disconnect', function() {
    var disconnectUser = 'UPDATE users SET active = (?) WHERE last_socket_id = (?)';

    con.query(disconnectUser, [0, socket.id], function (err, result, fields) {
      if (err) throw err;
      console.log('Client disconnected: ' + socket.id + ' and not active!');
    });
  });
});
