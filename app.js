var app = require('express')();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var mysql = require('mysql');

var con = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'mysql',
  database: 'nexto'
});

var port = 3000;
server.listen(port, () => console.log('serving on port: ' + port));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
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
    var sql = "INSERT INTO messages (userId, text, createdAt, lng, lat) VALUES (?, ?, ?, ?, ?)";
    var currTime = new Date().toString();
    con.query(sql, [msg.userId, msg.text, currTime, msg.lng, msg.lat], function(err, result) {
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
        lat: msg.lat
      };
      io.emit('newMessage', uploadedMsg);
    });
  });

  socket.on('disconnect', function() {
    console.log('Client disconnected: ' + socket.id);
  });
});
