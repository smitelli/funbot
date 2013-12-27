'use strict';

var onMessage = function (channel, from, message, matches) {
    this.message(channel, matches[1]);
};

module.exports.load = function (bot) {
    bot.onMessage(/^echo\s+(.+)/i, onMessage);
};
