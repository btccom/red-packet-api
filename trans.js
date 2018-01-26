"use strict";
const cn = {
    errors_private_key_error: '私钥错误',
    errors_private_key_format_error: '请不要扫描地址等东西',
    errors_get_amount_error: '获取红包余额失败',
    errors_address_error: '发送地址错误',
    errors_address_same: '发送地址和红包地址相同',
    errors_create_tx_fail: '创建交易失败',
    errors_amount_not_enough: '钱不够',
    errors_send_address_null: '给空地址发钱干啥'
};
const en = {
    errors_private_key_error: 'private key err',
    errors_private_key_format_error: 'Please do not scan the address, etc.',
    errors_get_amount_error: 'get amount err',
    errors_address_error: 'bitcoin cash address format error',
    errors_address_same: 'The address is same',
    errors_create_tx_fail: 'Create Tx Fail',
    errors_amount_not_enough: 'The amount is not enough',
    errors_send_address_null: 'send address null'
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = process.env.NODE_ENV === 'development' ? cn : en;

function getValue(lang, str) {
    return lang == 'cn' ? cn[str] : en[str];
}
exports.getValue = getValue;