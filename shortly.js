var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var crypto = require('crypto');

var app = express();



app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
});

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/create', function(req, res) {
  res.render('index');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/login', function(req, res) {
  res.render('login');
});


app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  })
});

app.post('/signup', function(req, res) {
  var shasum = crypto.createHash('sha1');
  var userInfo = req.body;
  var newPassword = shasum.update(req.body.password).digest('hex');
  console.log('newPassword', newPassword);
  userInfo.password = newPassword;
  userInfo.created_at = new Date();
  userInfo.updated_at = new Date();
  db.knex('users')
    .insert(userInfo)
    .then(function(){
      console.log("added");
    })
    .catch(function(err){
      console.log(err);
    });

  res.render('login');
});

app.post('/login',function(req, res){

  var formUsername = req.body.username;
  var formPassword = req.body.password;
  console.log(formUsername);
  console.log(formPassword);
  db.knex('users').select('password').where('username', formUsername).exec(function(err, resp){
        var shasum = crypto.createHash('sha1');
        var hash = shasum.update(formPassword).digest('hex');
        console.log('hash', hash);
        console.log('resp', resp);
        if(hash === resp[0].password){
          console.log('Yeahey');
        } else {
          console.log('Your password is wrong');
          res.render('login');
          // $('h2').append('<div>Your password is wrong</div>').css('color', 'red');
        }
      });

});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
