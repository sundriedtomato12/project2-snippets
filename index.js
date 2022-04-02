import express from 'express';
import pg from 'pg';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import { format } from 'date-fns';
import jsSHA from 'jssha';
import getHash from './functions.js';

// Initialise DB connection
const { Pool } = pg;
const pgConnectionConfigs = {
  user: 'postgres',
  host: 'localhost',
  database: 'snippets',
  port: 5432, // Postgres server always runs on this port by default
};
const pool = new Pool(pgConnectionConfigs);

const app = express();
// Configure Express to parse request body data into request.body
app.use(express.urlencoded({ extended: false }));
app.use('/', express.static('public'));
app.use(cookieParser());
// Override POST requests with query param ?_method=PUT to be PUT requests
// This registers ?_method=PUT to be PUT requests
app.use(methodOverride('_method'));

// the SALT is a constant value.
// In practice we would not want to store this "secret value" in plain text in our code.
// We will learn methods later in Coding Bootcamp to obfuscate this value in our code.
const SALT = 'i love coding';

let sqlQuery = '';
let loggedIn;

// middleware function to check login authentication before proceeding
app.use((request, response, next) => {
  console.log('Every Request:', request.path);
  // extract loggedInHash and userId from request cookies
  const { loggedInHash, userId } = request.cookies;
  console.log(loggedInHash);
  // create new SHA object
  // reconstruct the hashed cookie string
  const unhashedCookieString = `${userId}-${SALT}`;
  const hashedCookieString = getHash(unhashedCookieString);
  // verify if the generated hashed cookie string matches the request cookie value.
  // if hashed value doesn't match, return 403.
  if (hashedCookieString === loggedInHash) {
    loggedIn = true;
  } else {
    loggedIn = false;
  }
  next();
});

// GET homepage
app.get('/', (request, response) => {
  if (loggedIn) {
    response.render('dashboard');
  } else {
    response.render('homepage');
  }
});

// GET sign up page
app.get('/signup', (request, response) => {
  if (loggedIn) {
    response.render('dashboard');
  } else {
    console.log('request to sign up as new user');
    response.render('signup');
  }
});

// POST to create new user
app.post('/signup', (request, response) => {
  console.log('accept POST request to sign up new user');
  sqlQuery = 'INSERT INTO users (username, password) VALUES ($1, $2)';
  const hashedPassword = getHash(request.body.password);
  const inputData = [request.body.username, hashedPassword];

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    console.log('Successfully added new user to database');
    response.render('signupsuccessful');
  });
});

app.get('/login', (request, response) => {
  if (loggedIn) {
    response.render('dashboard');
  } else {
    console.log('request to login');
    response.render('login');
  }
});

app.post('/login', (request, response) => {
  console.log('accept POST request to log user in');
  const inputData = [request.body.username];
  sqlQuery = 'SELECT * FROM users WHERE username=$1';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error');
      return;
    }
    if (result.rows.length === 0) {
      // couldn't find user with that username
      // error for password and user are the same
      // don't tell the user which error they got for security reasons
      // otherwise they can guess if a person is a user of a given service
      response.status(403).render('error');
      return;
    }

    const user = result.rows[0];
    console.log('user details');
    console.log(user);
    const hashedUserInput = getHash(request.body.password);

    if (user.password === hashedUserInput) {
      // create an unhashed cookie string based on user ID and salt
      const unhashedCookieString = `${user.id}-${SALT}`;
      const hashedCookieString = getHash(unhashedCookieString);
      // set the loggedInHash and userId cookies in the response
      response.cookie('loggedInHash', hashedCookieString);
      response.cookie('username', user.username);
      response.cookie('userId', user.id);
      console.log('Login successful!');
      response.redirect('/dashboard');
    } else {
      response.status(403).render('error');
    }
  });
});

app.get('/dashboard', (request, response) => {
  const { userId, username } = request.cookies;
  const userData = [userId, username];
  console.log({ userData });
  response.render('dashboard', { userData });
});

// DELETE function to log user out
app.delete('/logout', (request, response) => {
  console.log('request to log out');
  response.clearCookie('userId');
  response.clearCookie('loggedInHash');
  response.clearCookie('username');
  loggedIn = false;
  response.redirect('/');
});

app.get('/entry', (request, response) => {
  console.log('request to create new entry');
  response.render('createentry');
});

app.post('/entry', (request, response) => {
  console.log('accept post request to create new entry');
  console.log(request.body);
  const { title, content } = request.body;
  const { username, userId } = request.cookies;
  const inputData = [userId, title, content];
  sqlQuery = 'INSERT INTO entries (user_id, title, content) VALUES ($1, $2, $3)';
  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error creating entry', error.stack);
      response.status(503).render('error');
      return;
    }
    console.log(`created entry for ${username}`);
    console.log(result.rows);
    response.render('entrycreated');
  });
});

app.set('view engine', 'ejs');

app.listen(80);
