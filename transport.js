const Transport = require('winston-transport');
const util = require('util');
const bearychat = require('bearychat');

module.exports = class BearychatTransport extends Transport {
    constructor(opts) {
        super(opts);
        this.token = opts.token;
        this.vchannel_id = opts.vchannel_id;
        //
        // Consume any custom options here. e.g.:
        // - Connection information for databases
        // - Authentication information for APIs (e.g. loggly, papertrail,
        //   logentries, etc.).
        //
    }

    log(info, callback) {
        bearychat.message.create({
                token: this.token,
                vchannel_id: this.vchannel_id,
                text: info.message,
                attachments: {}
            }).then(resp => resp.json())
            .then(data => console.log(data));

        // Perform the writing to the remote service
        callback();
    }
}