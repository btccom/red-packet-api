const fastify = require('fastify')({
    logger: true
})
const cors = require('cors')
fastify.use(cors())
const axios = require('axios')
const config = require('./config')
const bearychat = require('bearychat')
const winston = require('winston')
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}
var bitcoin = require('bitcoinforksjs-lib')
var bchaddr = require('bchaddrjs');
var TransactionBuilder = bitcoin.TransactionBuilder
var Transaction = bitcoin.Transaction

const bch_network = process.env.BCH_NETWORK || 'testnet';
const API = process.env.API || 'btc.com';
var network = bch_network === 'testnet' ? bitcoin.networks['testnet'] : bitcoin.networks['bitcoin']

async function getUTXO(address) {
    const chain = await axios(getURL(address));
    const json = chain.data;
    console.log(json);
    // if (json.err_no === 0 && json.data.count() > 0) {
    if (json.data.length > 0) {
        return {
            txhash: json.data[0].hash,
            value: json.data[0].value
        }
    } else {
        return false;
    }
}

async function broadcastTX(rawhex) {
    if (bch_network === 'testnet') {
        const url = 'https://tbcc.blockdozer.com/insight-api/tx/send'
        const send = await axios.post(url, { rawtx: rawhex })
        if (send.statusCode === 200) {
            logger.info('broadcastTX succeed, rawhex:' + rawhex);
        } else {
            logger.error('broadcastTX failure, rawhex:' + rawhex);
        }
    } else {
        const url = config.default.btccom_api_endpoint + 'tools/tx-publish'
        const send = await axios.post(url, { rawhex: rawhex })
        console.log(send.data);
        if (send.data.err_no === 0) {
            logger.info('broadcastTX succeed, rawhex:' + rawhex);
        } else {
            logger.error('broadcastTX failure, rawhex:' + rawhex);
        }
    }
}

function getURL(address) {
    if (bch_network === 'bitcoin' && API === 'btc.com') {
        return config.default.btccom_api_endpoint + 'address/' + address + '/unspent';
    } else if (bch_network === 'testnet') {
        return config.default.blocktrail_testnet_endpoint + '/address/' + address + '/unspent-outputs?api_key=' + config.default.blocktrail_key;
    } else {
        return config.default.blocktrail_endpoint + '/address/' + address + '/unspent-outputs?api_key=' + config.default.blocktrail_key;
    }
}

function output(err_no, err_msg, data) {
    if (err_no === 0) {
        return { err_no: err_no, data: data }
    } else {
        return { err_no: err_no, err_msg: err_msg }
    }
}

function sendBearychat(str) {
    bearychat.message.create({
            token: config.default.bearychat_token,
            vchannel_id: config.default.bearychat_alert,
            text: str,
            attachments: {}
        }).then(resp => resp.json())
        .then(data => console.log(data));
}

fastify.post('/api/' + config.default.route_url + '/amount', async function(request, reply) {
    const private_key = request.body.private_key.trim() || '';
    // verify private key
    if (private_key === '') {
        reply.send(output(1, 'private key err', null))
        return
    }
    var address = '';
    try {
        var keyPair = bitcoin.ECPair.fromWIF(private_key, network)
        address = keyPair.getAddress()
    } catch (e) {
        reply.send(output(1, 'private-key format err', null))
        return
    }
    try {
        if (address !== '') {
            const data = await getUTXO(address);
            if (!data) {
                reply.send(output(0, null, { address: address, amount: 0 }))
            } else {
                reply.send(output(0, null, { address: address, amount: data.value }))
            }
        }
    } catch (e) {
        logger.error('receive address:' + address + ',err:' + e.message);
        reply.send(output(1, 'get amount err', null))
        return
    }
})

fastify.post('/api/' + config.default.route_url + '/send', async function(request, reply) {
    const private_key = request.body.private_key.trim() || '';
    var toLegacyAddress = bchaddr.toLegacyAddress;
    var send_address = '';
    try {
        send_address = toLegacyAddress(request.body.send_address.trim()) || '';
    } catch (e) {
        reply.send(output(1, 'bitcoin cash address format error', null))
    }
    // verify private key
    if (private_key === '') {
        reply.send(output(1, 'error', null))
        return
    }
    var address = '';
    try {
        var keyPair = bitcoin.ECPair.fromWIF(private_key, network)
        address = keyPair.getAddress()
    } catch (e) {
        reply.send(output(1, 'private-key format err', null))
        return
    }
    try {
        if (address === send_address) {
            reply.send(output(1, 'The address is same', null))
            return
        }
        if (address !== '' && send_address !== '') {
            const data = await getUTXO(address);
            if (!data) {
                reply.send(output(1, 'The balance is not enough', null))
            } else {
                var vout = 0
                const fee = 100000
                const pk = keyPair.getPublicKeyBuffer()
                const pkh = bitcoin.crypto.hash160(pk)
                const spk = bitcoin.script.pubKeyHash.output.encode(pkh)
                var txb = new TransactionBuilder(network)
                txb.addInput(data.txhash, vout, Transaction.DEFAULT_SEQUENCE, spk)
                txb.addOutput(send_address, data.value - fee)
                txb.enableBitcoinCash(true)
                txb.setVersion(2)
                var hashType = Transaction.SIGHASH_ALL | Transaction.SIGHASH_BITCOINCASHBIP143
                txb.sign(0, keyPair, null, hashType, data.value)
                var tx = txb.build()
                var hex = tx.toHex()
                var txhash = tx.getId()
                logger.info('tx:' + txhash + ',rawhex:' + hex)
                console.log(tx.getId())
                console.log(hex)
                await broadcastTX(hex);
                reply.send(output(0, null, { address: address, txhash: txhash, rawhex: hex }))
                sendBearychat((bch_network === 'test_net' ? 'test_net:' : '') + "撒出了" + data.value + "个币，给" + send_address + "，交易哈希是" + txhash)
            }
        } else {
            reply.send(output(1, 'send address null', null))
        }
    } catch (e) {
        logger.error('gen tx:' + address + ',err:' + e.message);
        reply.send(output(1, 'send err', null))
        return
    }
})

fastify.listen(3000, function(err) {
    if (err) throw err
    console.log(`server listening on ${fastify.server.address().port}`)
});