var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');

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
      console.log('error when connecting to db...settingTimeout then connecting again');
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  con.on('error', function(err) {
    console.log('db error', err);
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
    let avatar = input.avatar;

    var sql = 'SELECT * FROM messages, users WHERE messages.user_id = users.id HAVING (6371393 * acos(cos(radians((?))) * cos(radians(messages.lat)) * cos(radians(messages.lng) - radians((?))) + sin(radians((?))) * sin(radians(messages.lat))) < 300) ORDER BY messages.id;'
    con.query(sql, [lat, long, lat], function (err, result, fields) {
      if (err) throw err;

      console.log(result);
      socket.emit('initMessages', result);
      console.log('sent all initial messages');
    });

    var newUserSql = 'INSERT INTO users (avatar) VALUES (?)';
    con.query(newUserSql, [avatar], function (err, result, fields) {
      if (err) throw err;
      if (result) {
        var user_id = result.insertId;
        console.log("User id given: " + user_id);

        socket.emit("userId", {userId: user_id});
      } else {
        socket.emit("userId", {userId: 1});
      }
    });
  });

  socket.on('newMessage', function(msg) {
    var sql = "INSERT INTO messages (lat, lng, text, user_id) VALUES (?, ?, ?, ?)";
    var currTime = new Date().toString();
    con.query(sql, [msg.lat, msg.long, msg.text, msg.user_id], function(err, result, fields) {
      if (err) throw err;

      var msgId = result.insertId;
      console.log('Message with id ' + msgId + ' inserted!');

      var uploadedMsg = {
        id: msgId,
        user_id: msg.user_id,
        text: msg.text,
        created: currTime,
        long: msg.long,
        lat: msg.lat,
        avatar: msg.avatar
      };
      io.emit('newMessage', uploadedMsg);
    });
  });

  socket.on('disconnect', function() {
    console.log('Client disconnected: ' + socket.id);
  });
});
