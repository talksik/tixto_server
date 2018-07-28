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
      console.log('error when connecting to db:', err);
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

app.get('/userid', function (req, res) {
  con.query('SELECT max(userId) from messages;', function (err, result, fields) {
    if (err) throw err;
    if (result)
      res.json({userId: result + 1});
    else
      res.json({userId: 1});
  });
});


io.on('connection', function (socket) {
  console.log('Client connected: ' + socket.id);

  socket.on('initial', (position) => {
    console.log(position.long + ' ' + position.lat);
    //var sql = 'select * from messages where lng = 0';
    var sql = 'SELECT * FROM messages HAVING (6371393 * acos(cos(radians((?))) * cos(radians(lat)) * cos(radians(lng) - radians((?))) + sin(radians((?))) * sin(radians(lat))) < 100) ORDER BY id;'
    con.query(sql, [position.lat, position.long, position.lat], function (err, result, fields) {
      if (err) throw err;
      socket.emit('initMessages', result);
      console.log('sent all initial messages');
    });
  });

  //io.on('test', () => console.log('worked~')); // test with web page

  socket.on('newMessage', function(msg) {
    var sql = "INSERT INTO messages (userId, text, createdAt, lng, lat, avatar) VALUES (?, ?, ?, ?, ?, ?)";
    var currTime = new Date().toString();
    con.query(sql, [msg.userId, msg.text, currTime, msg.lng, msg.lat, msg.avatar], function(err, result) {
      if (err) throw err;
      console.log('Message sent to db!');

      var msgId = 0;
      con.query('SELECT LAST_INSERT_ID()', function(err, result) {
        if(err) throw err;
        msgId = result;
        console.log(msgId);
      });
      var uploadedMsg = {
        id: msgId,
        userId: msg.userId,
        text: msg.text,
        createdAt: currTime,
        lng: msg.lng,
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
