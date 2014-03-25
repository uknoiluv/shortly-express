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
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var connectEnsureLogin = require('connect-ensure-login');

var TWITTER_CONSUMER_KEY = "EFC7T8qeNZsNvEOsbl120Q";
var TWITTER_CONSUMER_SECRET = "YerABenwl67hWyDH0FAxyVmMBxndNGzC1nQS1ljWDYY";

var userProfile;
var userDisplayName;

passport.serializeUser(function(user, done){
  done(null, user);
});

passport.deserializeUser(function(obj, done){
  done(null, obj);
});

passport.use(new TwitterStrategy({
  consumerKey: TWITTER_CONSUMER_KEY,
  consumerSecret: TWITTER_CONSUMER_SECRET,
  callbackURL: '/auth/twitter/callback'
},
  function(token, tokenSecret, profile, done){
    /*
    process.nextTick(function(){
      return done(null, profile);
    });
*/

// this is a "verify callback". it recevies credentials as arguments
// which are used to locate and return user records.
  console.log("token: ", token);
  console.log("tokenSecreT: ", tokenSecret);
  userProfile = profile;
  userDisplayName = profile.displayName;
  console.log("twitterID: ", profile.id);
  db.knex('users')
    .select()
    .where('twitterID', profile.id)
    .exec(function(err, resp){
      return done(err, resp);
  //User.findOrCreate({twitterId: profile.id}, function(err, user){
  //  return done(err, user); //github passport-twitter
    });
}));

var app = express();
app.use(express.cookieParser());
app.use(express.session({secret: '123'}));
app.use(passport.initialize());
app.use(passport.session());


app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
});

// app.use(function(req, res, next){
//   checkUser(req, res);
//   next();
// });
/*
app.use(function (req, res, next) {
  // check if client sent cookie
  var cookie = req.cookies.loggedIn;
  if (cookie === undefined)
  {
    // no: set a new cookie
    res.cookie('loggedIn', false, {maxAge: 900000, httpOnly: true});
    //res.cookie('cookieName',randomNumber, { maxAge: 900000, httpOnly: true });
    console.log('cookie have created successfully');
  }
  else
  {
    if(cookie === true){
      res.cookie('loggedIn', hashedUsername, {maxAge: 900000, httpOnly: true});
      console.log('cookie exists', cookie);
    }
  }
  next(); // <-- important!
});
*/

app.get('/', ensureAuthenticated, function(req, res) {
  //checkUser(req, res);
  res.render('index');
});

app.get('/create', ensureAuthenticated, function(req, res) {
  res.render('index');
});

app.get('/signup', function(req, res) {
  res.render('signup');
});

app.get('/login', function(req, res) {
  res.send('<html><body><a href="/auth/twitter">Sign in with Twitter</a></body></html>');
  // res.render('login');
});

app.get('/account', ensureAuthenticated, function(req, res) {
    res.send('Hello ' + userDisplayName);
});

app.get('/links', ensureAuthenticated, function(req, res) {
  //checkUser(req, res);
  // console.log('coookie :',req.cookies.loggedIn);
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

// Twitter Required Route #1
// Initiates an OAuth transaction and redirects the user to Twitter.
app.get('/auth/twitter', passport.authenticate('twitter'));

// Twitter Required Route #2
// URL to which Twitter will redirect the user after they have signed in.
app.get('/auth/twitter/callback', passport.authenticate('twitter', {
  successRedirect: '/', failureRedirect: '/login'
}));

// From PassportJS
app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/login');
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

  res.redirect('/login');
});

app.post('/login',function(req, res){
  console.log('post login');
  var formUsername = req.body.username;
  var formPassword = req.body.password;
  console.log(formUsername);
  console.log(formPassword);
  db.knex('users').select('password').where('username', formUsername).exec(function(err, resp){
        var shasum = crypto.createHash('sha1');
        var hash = shasum.update(formPassword).digest('hex');
        console.log('hash', hash);
        console.log('resp', resp);
        if(resp[0] !== undefined){
          if(hash === resp[0].password){
          console.log('Yeahey');
          req.session.user_id = formUsername;
          res.render('index');
          }
        } else {
          console.log('Your password is wrong');
          res.redirect('/login');
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

app.post('/logout', function(req, res) {
  //res.cookie('loggedIn', false, {maxAge: 900000, httpOnly: true});
  // console.log(req.session.user_id);
  delete req.session.user_id;
  //
  // console.log(req.session.user_id);
  res.redirect('/login');
});


/************************************************************/
// Write your authentication routes here
/************************************************************/

function checkUser( req, res, next){
  /*
  if(!req.session.user_id){
    res.render('login');
  }else{
    next();
  }
  */
};

function ensureAuthenticated (req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

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
