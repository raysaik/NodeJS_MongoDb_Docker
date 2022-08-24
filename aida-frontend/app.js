'use strict'

const express = require('express');
const q = require('q');
const axios = require('axios');
const EventEmitter = require('events')
const aws = require('aws-sdk');

const app = express()
const eventEmitter = new EventEmitter();
const TraceHeader = 'x-trace';

let config = require('./package.json').config;
let kinesis = null;

function readCustomer(req, res) {

    writeMetric('readCustomer.attempt');

    let traceId = req.headers[TraceHeader] || '';

    if (!req.params || !req.params.customerId) {
        writeMetric('readCustomer.fail');
        writeLog(`No customerId specified`, traceId);
        res.status(400);
        res.send('customerId missing');
        return;
    }

    writeLog(`Reading customer ${req.params.customerId}`, traceId);

    axios
        .get(config.dependencies.cinemoInternalUrl + '/api/cache/' + req.params.customerId)
        .then((response) => {
            writeMetric('readCustomer.success');
            writeLog(`Successfully read customer with customerId '${req.params.customerId}'`, traceId);
            res.json(response.data);
        })
        .catch(error => {
            writeMetric('readCustomer.fail');
            writeLog(`Failed to read customer with customerId '${req.params.customerId}'`, traceId);
            writeLog(error.response.data, traceId);
            res.status(error.response.status);
            res.send(error.response.data);
        });   
}

function CreateCustomer(req, res) {
    
    writeMetric('createCustomer.attempt');

    let traceId = req.headers[TraceHeader] || '';

    if (!req.body || !req.body.name) {
        writeLog(`No customer name specified`, traceId);
        writeMetric('createCustomer.fail');
        res.status(400);
        res.send('customer name missing');
        return;
    }

    writeLog(`Creaing new customer with name ${req.body.name}`, traceId);

    let customer = {
        name: req.body.name,
        dateCreated: new Date().getTime()
    };

    axios
        .post(config.dependencies.cinemoInternalUrl + '/api/cache', customer)
        .then((response) => {
            writeMetric('createCustomer.success');
            writeLog(`Successfully created customer with name ${req.body.name}`, traceId);
            res.json({customerId: response.data.id});
        })
        .catch(error => {
            writeMetric('createCustomer.fail');
            writeLog(`Failed to create customer with name ${req.body.name}`, traceId);
            writeLog(error.response.data, traceId);
            res.status(error.response.status);
            res.send(error.response.data);
        });
}

function writeLog(message, traceId) {

    if (!traceId) {
        return;
    }

    let frame = {
        type: 'logs',
        data: {
            appId: 'cinemo-public',
            traceId: traceId,
            message: message,
            timestamp: new Date().getTime()
        }
    };

    let record = {
        Data: JSON.stringify(frame),
        StreamName: config.kinesis.streamName,
        PartitionKey: config.kinesis.partitionKey
      };

    kinesis
        .putRecord(record, function(err, data) {
            if (err) {
                console.error(err);
            }
        });
}

function writeMetric(name) {

    let frame = {
        type: 'metrics',
        data: {
            appId: 'cinemo-public',
            name: name,
            count: 1,
            timestamp: new Date().getTime()
        }
    };

    let record = {
        Data: JSON.stringify(frame),
        StreamName: config.kinesis.streamName,
        PartitionKey: config.kinesis.partitionKey
      };

    kinesis
        .putRecord(record, function(err, data) {
            if (err) {
                console.error(err);
            }
        });
}

function connectKinesis() {

    aws.config.loadFromPath('./aws.json');
                                          
    kinesis = new aws.Kinesis({
        region: config.kinesis.region,
        endpoint: config.kinesis.endpoint,
    });

    return q();
}

function attachHandlers() {
    
    app.use(express.json())

    return q();
}

function createRoutes() {

    app.get('/api/health', (req, res) => res.send('Frontend healthy'));
    app.get('/api/customers/:customerId', readCustomer);
    app.post('/api/customers', CreateCustomer);

    return q();
}

function serve() {
    
    app.listen(config.service.port, () => console.log(`cinemo-public listening on port ${config.service.port}`));
    
    return q();
}

function main() {

    connectKinesis()
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
