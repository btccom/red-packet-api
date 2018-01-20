"use strict";
const config = {
    debug: true,
    route_url: 'test',
    blocktrail_key: '',
    blocktrail_endpoint: 'https://api.blocktrail.com/v1/tbcc',
    blocktrail_testnet_endpoint: 'https://api.blocktrail.com/v1/tbcc',
    bearychat_token: '',
    bearychat_alert: '',
    btccom_api_endpoint: 'https://bch-chain.api.btc.com/v3'
};
const production_config = {
    debug: false,
    route_url: 'test',
    blocktrail_key: '',
    blocktrail_endpoint: 'https://api.blocktrail.com/v1/tbcc',
    blocktrail_testnet_endpoint: 'https://api.blocktrail.com/v1/tbcc',
    bearychat_token: '',
    bearychat_alert: '',
    btccom_api_endpoint: 'https://bch-chain.api.btc.com/v3'
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = process.env.NODE_ENV === 'development' ? config : production_config;