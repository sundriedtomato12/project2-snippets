import express from 'express';
import pg from 'pg';
import methodOverride from 'method-override';
import cookieParser from 'cookie-parser';
import { format } from 'date-fns';
import jsSHA from 'jssha';
import getHash from './functions.js';

// Initialise DB connection
const { Pool } = pg;
let pgConnectionConfigs;
// test to see if the env var is set. Then we know we are in Heroku
if (process.env.DATABASE_URL) {
  // pg will take in the entire value and use it to connect
  pgConnectionConfigs = {
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  };
} else {
  pgConnectionConfigs = {
    user: 'postgres',
    host: 'localhost',
    database: 'snippets',
    port: 5432, // Postgres server always runs on this port by default
  };
}
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
  const { loggedInHash, userId, username } = request.cookies;
  console.log(loggedInHash);
  // create new SHA object
  // reconstruct the hashed cookie string
  const unhashedCookieString = `${userId}-${SALT}`;
  const hashedCookieString = getHash(unhashedCookieString);
  // verify if the generated hashed cookie string matches the request cookie value.
  // if hashed value doesn't match, return 403.
  if (hashedCookieString === loggedInHash) {
    loggedIn = true;
    app.locals.username = username;
  } else {
    loggedIn = false;
  }
  next();
});

app.get('/', (request, response) => {
  if (loggedIn) {
    response.redirect('/dashboard');
  } else {
    response.render('homepage');
  }
});

app.get('/signup', (request, response) => {
  if (loggedIn) {
    response.redirect('/dashboard');
  } else {
    console.log('request to sign up as new user');
    response.render('signup');
  }
});

app.post('/signup', (request, response) => {
  console.log('accept POST request to sign up new user');
  sqlQuery = 'INSERT INTO users (username, password) VALUES ($1, $2)';
  const hashedPassword = getHash(request.body.password);
  const inputData = [request.body.username, hashedPassword];

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error1');
      return;
    }
    console.log('Successfully added new user to database');
    response.render('signupsuccessful');
  });
});

app.get('/login', (request, response) => {
  if (loggedIn) {
    response.redirect('/dashboard');
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
      response.status(503).render('error1');
      return;
    }
    if (result.rows.length === 0) {
      // couldn't find user with that username
      // error for password and user are the same
      // don't tell the user which error they got for security reasons
      // otherwise they can guess if a person is a user of a given service
      response.status(403).render('error1');
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
      response.status(403).render('error1');
    }
  });
});

app.get('/dashboard', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    const userId = [parseInt(request.cookies.userId)];
    const promise1 = pool.query('SELECT * FROM users');
    const promise2 = pool.query('SELECT * FROM entries WHERE user_id = $1', userId);
    Promise.all([promise1, promise2]).then((allResults) => {
      const usersData = allResults[0].rows;
      const numOfEntries = [allResults[1].rows.length];
      response.render('dashboard', { usersData, numOfEntries });
    }).catch((error) => {
      console.log(error);
      response.render('error2');
    });
  }
});

app.delete('/logout', (request, response) => {
  console.log('request to log out');
  response.clearCookie('userId');
  response.clearCookie('loggedInHash');
  response.clearCookie('username');
  loggedIn = false;
  response.redirect('/');
});

app.get('/entry', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    console.log('request to create new entry');
    response.render('createentry');
  }
});

app.post('/entry', (request, response) => {
  console.log('accept post request to create new entry');
  console.log(request.body);
  const { title, content } = request.body;
  const { username, userId } = request.cookies;
  const inputData = [userId, title, content];

  pool.query('INSERT INTO entries (user_id, title, content) VALUES ($1, $2, $3) RETURNING id', inputData, (error, result) => {
    if (error) {
      console.log('Error creating entry', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log(`created entry for ${username}`);
    const data = result.rows[0];
    console.log({ data });
    response.render('entrycreated', { data });
  });
});

app.get('/entry/:id', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    console.log('request to view entry id:');
    console.log(request.params.id);
    const id = [request.params.id];
    const data = [request.params.id, request.cookies.userId];
    const promise1 = pool.query('SELECT * FROM comments WHERE comments.entry_id = $1', id);
    const promise2 = pool.query('SELECT users.id AS user_id, users.username, entries.id AS entry_id, entries.title, entries.content, entries.created_at  FROM users JOIN entries ON users.id = entries.user_id WHERE entries.id = $1', id);
    const promise3 = pool.query('SELECT * from favourites where entry_id = $1 AND user_id = $2', data);
    Promise.all([promise1, promise2, promise3]).then((allResults) => {
      const commentsData = allResults[0].rows;
      commentsData.sort((a, b) => a.created_at - b.created_at);
      for (let i = 0; i < commentsData.length; i += 1) {
        const newDate = format(new Date(commentsData[i].created_at), 'dd MMM yyyy p');
        commentsData[i].created_at = newDate;
      }
      console.log('comments');
      console.log(commentsData);
      const entryData = allResults[1].rows[0];
      const entryDate = format(new Date(entryData.created_at), 'dd MMM yyyy p');
      entryData.created_at = entryDate;
      const favouritesData = allResults[2].rows;
      console.log('favourites data');
      console.log(favouritesData);
      const userId = [request.cookies.userId];
      console.log(userId);
      response.render('viewentry', {
        commentsData, entryData, favouritesData, userId,
      });
    }).catch((error) => {
      console.log(error);
      response.status(503).render('error2');
    });
  }
});

app.post('/entry/:id/comment', (request, response) => {
  console.log('accept post request to create comment on entry');
  console.log(request.body);
  const entryId = request.params.id;
  const { comment } = request.body;
  const { username, userId } = request.cookies;
  const inputData = [userId, username, entryId, comment];

  pool.query('INSERT INTO comments (user_id, username, entry_id, comment) VALUES ($1, $2, $3, $4)', inputData, (error, result) => {
    if (error) {
      console.log('Error creating entry', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log(`created entry for ${username}`);
    const data = result.rows[0];
    console.log('comment posted!');
    console.log({ data });
    response.redirect(`/entry/${entryId}`);
  });
});

app.delete('/entry/:entryid/comment/:commentid', (request, response) => {
  console.log('request to delete comment id');
  console.log(request.params.commentid);
  const entryId = request.params.entryid;
  const commentId = [request.params.commentid];

  sqlQuery = 'DELETE FROM comments WHERE id = $1';

  pool.query(sqlQuery, commentId, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log('entry successfully deleted');
    response.redirect(`/entry/${entryId}`);
  });
});

app.get('/entry/:id/edit', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    console.log('request to edit note id:');
    console.log(request.params.id);
    const id = [request.params.id];
    sqlQuery = 'SELECT * FROM entries WHERE id = $1';

    pool.query(sqlQuery, id, (error, result) => {
      if (error) {
        console.log('Error executing query', error.stack);
        response.status(503).render('error2');
        return;
      }
      if (result.rows.length <= 0) {
        console.log('No such id!');
      } else {
        console.log(result.rows);
      }
      const data = result.rows[0];
      response.render('editentry', { data });
    });
  }
});

app.put('/entry/:id', (request, response) => {
  console.log('request to edit entry id:');
  console.log(request.params.id);
  const { title, content } = request.body;
  const inputData = [request.params.id, title, content];

  sqlQuery = 'UPDATE entries SET title = $2, content = $3 WHERE id = $1';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log('entry edited!');
    response.render('entryedited', { inputData });
  });
});

app.post('/entry/:id/favourites', (request, response) => {
  console.log('request to add entry id:');
  console.log(request.params.id);
  console.log('to favourites');
  const inputData = [request.cookies.userId, request.params.id];
  sqlQuery = 'INSERT INTO favourites (user_id, entry_id) VALUES ($1, $2)';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log('added to favourites!');
    response.redirect(`/entry/${request.params.id}`);
  });
});

app.post('/entry/:id/removefromfavourites', (request, response) => {
  console.log('request to add entry id:');
  console.log(request.params.id);
  console.log('to favourites');
  const inputData = [request.cookies.userId, request.params.id];
  sqlQuery = 'DELETE FROM favourites WHERE user_id = $1 AND entry_id = $2';

  pool.query(sqlQuery, inputData, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log('removed from favourites!');
    response.redirect(`/entry/${request.params.id}`);
  });
});

app.delete('/entry/:id', (request, response) => {
  console.log('request to delete entry id:');
  console.log(request.params.id);
  const id = [request.params.id];
  sqlQuery = 'DELETE FROM entries WHERE id = $1';

  pool.query(sqlQuery, id, (error, result) => {
    if (error) {
      console.log('Error executing query', error.stack);
      response.status(503).render('error2');
      return;
    }
    console.log('entry successfully deleted');
    response.render('entrydeleted');
  });
});

app.get('/blog/:username', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    console.log('request to view blog of username:');
    console.log(request.params.username);
    const username = [request.params.username];
    sqlQuery = 'SELECT users.id AS user_id, users.username, entries.id AS entry_id, entries.title, entries.content, entries.created_at FROM users JOIN entries ON users.id = entries.user_id WHERE users.username = $1';

    pool.query(sqlQuery, username, (error, result) => {
      if (error) {
        console.log('Error executing query', error.stack);
        response.status(503).render('error2');
        return;
      }
      if (result.rows.length <= 0) {
        console.log('No results!');
      } else {
        console.log(result.rows);
      }
      const data = result.rows;
      for (let i = 0; i < data.length; i += 1) {
        const newDate = format(new Date(data[i].created_at), 'dd MMM yyyy p');
        data[i].created_at = newDate;
      }

      data.sort((a, b) => b.entry_id - a.entry_id);

      response.render('viewblog', { data, username });
    });
  }
});

app.get('/favourites', (request, response) => {
  if (!loggedIn) {
    response.redirect('/');
  } else {
    console.log('request to view list of favourited posts');
    const userId = [request.cookies.userId];
    sqlQuery = 'SELECT entry_id FROM favourites WHERE user_id = $1';

    pool.query(sqlQuery, userId).then((result) => {
      const data = [];
      for (let i = 0; i < result.rows.length; i += 1) {
        data.push(result.rows[i].entry_id);
      }
      const joined = [data.join(', ')];
      sqlQuery = `SELECT * FROM entries WHERE id IN (${joined})`;
      return pool.query(sqlQuery);
    }).then((result) => {
      const favouritesData = result.rows;
      favouritesData.sort((a, b) => a.id - b.id);
      console.log(favouritesData);
      response.render('favourites', { favouritesData });
    }).catch((error) => {
      console.log(error);
      response.status(503).render('error2');
    });
  }
});

app.set('view engine', 'ejs');

app.listen(process.env.PORT || 80);
