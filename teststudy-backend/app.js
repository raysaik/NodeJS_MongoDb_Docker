'use strict'

const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const ObjectId = require('mongodb').ObjectID;
const q = require('q');
const EventEmitter = require('events')

const app = express()
const eventEmitter = new EventEmitter();

let config   =   require('./package.json').config;

let mongoClient = null;
let mongoDatabase = null;

let mongoCollection = null;

function readCache(req, res) {

    if (!mongoClient.isConnected()) {
        res.status(504);
        res.send('MongoDB not connected');
        return;
    }

    if (!req.params || !req.params.cacheId) {
        res.status(400);
        res.send('cacheId not found');
        return;
    }

    mongoCollection.find({'_id': ObjectId(req.params.cacheId)}).toArray(function(err, docs) {
        if (!err) {
            if (docs && docs.length > 0) {
                res.send(docs[0])
            } else {
                res.status(404);
                res.send('cacheId not found');
            }
        } else {
            res.status(500);
            res.send(err.message);
        }
      });
}

function checkDbConnection(req, res){
    if (mongoClient.isConnected()){
        res.status(200);
        res.send('Connected');
    }
    else{
        res.status(504);
        res.send('Not Connected');
    }
    return;
}
function writeCache(req, res) {

    if (!mongoClient.isConnected()) {
          res.status(504);
          res.send('MongoDB not connected');
          return;
    }

    if (!req.body) {
        res.status(400);
        res.send('missing body');
        return;
    }
    
    mongoCollection.insertOne(req.body, function(err, result) {
        if (!err) {
            res.json({id: result.ops[0]._id});
        } else {
            res.status(500);
            res.send(err.message);
        }
      });
}

function attachHandlers() {
    
    app.use(express.json())

    return q();
}

function createRoutes() {

    app.get('/api/health', (req, res) => res.send('Healthy'));
    app.get('/api/checkDbConnection', checkDbConnection);
    app.get('/api/cache/:cacheId', readCache);
    app.post('/api/cache', writeCache);

    return q();
}




function serve() {
    
    app.listen(config.service.port, () => console.log(`teststudy-internal listening on port ${config.service.port}`));
    
    return q();
}

function connectMongoDb() {

    let deferred = q.defer();

    //mongoClient = new MongoClient(config.mongodb.url);
    //Get the value from Environment, so that we can pass different values from Kubernetes
    mongoClient = new MongoClient(process.env.MONGODB_URL);

    mongoClient
        .connect(function(err) {
            if (!err) {
                console.log(`Successfully connected to MongoDB at '${process.env.MONGODB_URL}'`);
                mongoDatabase = mongoClient.db(config.mongodb.databaseName);
                mongoCollection = mongoDatabase.collection(config.mongodb.collectionName);
                deferred.resolve();
            } else {
                console.log(`Failed to connect to MongoDB at '${process.env.MONGODB_URL}'`);
                deferred.reject(err);
            }
        });

    return deferred.promise;
}

function main() {
    
    connectMongoDb()
        .then(attachHandlers)
        .then(createRoutes)
        .then(serve)
        .catch(function(err) {
            console.log(err);
            eventEmitter.emit('done');
        });

    // keep alive                           
    eventEmitter.on('done', function(r) {});
}

(function() {
      main();
})();
