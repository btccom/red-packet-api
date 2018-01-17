const fastify = require('fastify')({
    logger: true
})
const axios = require('axios')
const config = require('./config')
const bearychat = require('bearychat');

var bitcoin = require('bitcoinforksjs-lib')
var network = bitcoin.networks['testnet']
var TransactionBuilder = bitcoin.TransactionBuilder
var Transaction = bitcoin.Transaction

const bch_network = process.env.BCH_NETWORK || 'testnet';
const API = process.env.API || 'btc.com';

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

function getURL(address) {
    if (bch_network === 'bitcoin' && API === 'btc.com') {
        return 'https://bch-chain.api.btc.com/v3/address/' + address + '/unspent';
    } else if (bch_network === 'testnet') {
        return 'https://api.blocktrail.com/v1/tbcc/address/' + address + '/unspent-outputs?api_key=' + config.default.blocktrail_key;
    } else {
        return 'https://api.blocktrail.com/v1/tbcc/address/' + address + '/unspent-outputs?api_key=' + config.default.blocktrail_key;
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
        console.log(address);
    } catch (e) {
        console.log(e);
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
        console.log(e);
        reply.send(output(1, 'get amount err', null))
        return
    }
})

fastify.post('/api/' + config.default.route_url + '/send', async function(request, reply) {
    const private_key = request.body.private_key.trim() || '';
    const send_address = request.body.send_address.trim() || '';
    // verify private key
    if (private_key === '') {
        reply.send({ err_no: 1, err_msg: 'error' })
        return
    }
    var address = '';
    try {
        var keyPair = bitcoin.ECPair.fromWIF(private_key, network)
        address = keyPair.getAddress()
        if (address !== '' && send_address !== '') {
            const data = await getUTXO(address);
            if (!data) {
                reply.send(output(1, 'The balance is not enough'))
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
                console.log(tx.getId())
                console.log(hex)
                    // 广播
                reply.send({ address: address, txhash: txhash })
                sendBearychat((bch_network === 'test_net' ? 'test_net:' : '') + "撒出了" + data.value + "个币，给" + send_address + "，交易哈希是" + txhash)
            }
        }
    } catch (e) {
        console.log(e)
        reply.send({
            err_no: 1,
            err_msg: 'send error'
        })
        return
    }
})

fastify.listen(3000, function(err) {
    if (err) throw err
    console.log(`server listening on ${fastify.server.address().port}`)
});