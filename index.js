const fastify = require('fastify')({
        logger: true
    })
    // const cors = require('cors')
    // fastify.use(cors())
fastify.register(require('fastify-accepts'))
const axios = require('axios')
const trans = require('./trans')
const BearychatTransport = require('./transport')
const config = require('./config')
const bearychat = require('bearychat')
const winston = require('winston')
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/tx.log', level: 'warn' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new BearychatTransport({ token: config.default.bearychat_token, vchannel_id: config.default.bearychat_alert, level: 'error' })
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

const bch_network = process.env.BCH_NETWORK || 'bitcoin';
const API = process.env.API || (bch_network === 'testnet' ? 'blocktrail' : 'btc.com');
var network = bch_network === 'testnet' ? bitcoin.networks['testnet'] : bitcoin.networks['bitcoin']

async function getUTXO(address) {
    const chain = await axios(getURL(address));
    const json = chain.data;
    console.log(json);
    if (API === 'btc.com') {
        if (json.err_no === 0 && json.data.total_count > 0) {
            return {
                txhash: json.data.list[0].tx_hash,
                value: json.data.list[0].value,
                out_input: json.data.list[0].tx_output_n
            }
        } else {
            return false;
        }
    } else {
        if (json.data.length > 0) {
            return {
                txhash: json.data[0].hash,
                value: json.data[0].value
            }
        } else {
            return false;
        }
    }
}

async function broadcastTX(rawhex) {
    if (bch_network === 'testnet') {
        const url = 'https://tbcc.blockdozer.com/insight-api/tx/send'
        const send = await axios.post(url, { rawtx: rawhex })
        if (send.data.txid) {
            logger.info('broadcastTX succeed, rawhex:' + rawhex);
        } else {
            logger.error('send.statusCode:' + send.statusCode + 'broadcastTX failure, rawhex:' + rawhex);
        }
    } else {
        const url = config.default.btccom_api_endpoint + '/tools/tx-publish'
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
        return config.default.btccom_api_endpoint + '/address/' + address + '/unspent';
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

fastify.post('/api/' + config.default.route_url + '/amount', async function(request, reply) {
    const private_key = request.body.private_key.trim() || '';
    let lang = 'cn';
    if (request.languages().length > 0) {
        const languages = request.languages()[0];
        lang = (languages === 'en' || languages === 'en-us') ? 'en' : 'cn';
    }
    // verify private key
    if (private_key === '') {
        reply.send(output(1, trans.getValue(lang, 'errors_private_key_error'), null))
        return
    }
    var address = '';
    try {
        var keyPair = bitcoin.ECPair.fromWIF(private_key, network)
        address = keyPair.getAddress()
    } catch (e) {
        logger.error(e);
        reply.send(output(1, trans.getValue(lang, 'errors_private_key_format_error'), null))
        return
    }
    try {
        if (address !== '') {
            const data = await getUTXO(address);
            console.log(data);
            if (!data) {
                reply.send(output(0, null, { address: address, amount: 0 }))
            } else {
                reply.send(output(0, null, { address: address, amount: (data.value / 100000000) }))
            }
        }
    } catch (e) {
        logger.error('receive address:' + address + ',err:' + e.message);
        reply.send(output(1, trans.getValue(lang, 'errors_get_amount_error'), null))
        return
    }
})

fastify.post('/api/' + config.default.route_url + '/send', async function(request, reply) {
    const private_key = request.body.private_key.trim() || '';
    var toLegacyAddress = bchaddr.toLegacyAddress;
    var send_address = '';
    let lang = 'cn';
    if (request.languages().length > 0) {
        const languages = request.languages()[0];
        lang = (languages === 'en' || languages === 'en-us') ? 'en' : 'cn';
    }
    try {
        send_address = toLegacyAddress(request.body.send_address.trim()) || '';
    } catch (e) {
        reply.send(output(1, trans.getValue(lang, 'errors_address_error'), null))
    }
    // verify private key
    if (private_key === '') {
        reply.send(output(1, trans.getValue(lang, 'errors_private_key_error'), null))
        return
    }
    var address = '';
    try {
        var keyPair = bitcoin.ECPair.fromWIF(private_key, network)
        address = keyPair.getAddress()
    } catch (e) {
        logger.error(e);
        reply.send(output(1, trans.getValue(lang, 'errors_private_key_format_error'), null))
        return
    }
    try {
        if (address === send_address) {
            reply.send(output(1, trans.getValue(lang, 'errors_address_same'), null))
            return
        }
        if (address !== '' && send_address !== '') {
            const data = await getUTXO(address);
            if (!data) {
                reply.send(output(1, trans.getValue(lang, 'errors_amount_not_enough'), null))
            } else {
                var vout = data.out_input
                const fee = 300
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
                await broadcastTX(hex, txhash);
                logger.warn('address:' + send_address + ',tx:' + txhash + ', hex:' + hex);
                reply.send(output(0, null, { address: address, txhash: txhash, rawhex: hex }))
                logger.error((bch_network === 'test_net' ? 'test_net:' : '') + "撒出了" + data.value + "个币，给" + send_address + "，交易哈希是" + txhash)
            }
        } else {
            reply.send(output(1, trans.getValue(lang, 'errors_send_address_null'), null))
        }
    } catch (e) {
        logger.error('gen tx:' + address + ',err:' + e.message);
        reply.send(output(1, trans.getValue(lang, 'errors_create_tx_fail'), null))
        return
    }
})

fastify.listen(3000, function(err) {
    if (err) throw err
    console.log(`server listening on ${fastify.server.address().port}`)
});