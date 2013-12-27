'use strict';

// Based on https://github.com/jaredklett/PlusPlusBot

var format   = require('util').format,
    PlusPlus = {};

PlusPlus.THROTTLE_LIMIT = 10;  //seconds

PlusPlus.load = function(bot) {
    // Handle instances of '++' and '--'. Also grab any en- and em-dashes.
    bot.onMessage(/\+\+|--|\u2013|\u2014/, PlusPlus.parseAwardCommand);
};

PlusPlus.parseAwardCommand = function (channel, from, message) {
    // Consider en- and em-dashes as possible '--' awards
    message = message.replace(/\u2013|\u2014/g, '--');

    // Pad the message with a leading and trailing space. (Makes the regexes a
    // hell of a lot simpler and more robust.)
    message = format(' %s ', message);

    var bot        = this,
        plusMatch  = message.match(/\s\+\+\s*@?(\w+)|@?(\w+)\s*\+\+\s/),
        minusMatch = message.match(/\s--\s*@?(\w+)|@?(\w+)\s*--\s/),
        toUserName,
        award;

    if (plusMatch && minusMatch) {
        // Both a '++'' and a '--'; ignore the whole thing
        return;

    } else if (plusMatch) {
        // user++ or ++user
        toUserName = plusMatch[1] || plusMatch[2];
        award = 1;

    } else if (minusMatch) {
        // user-- or --user
        toUserName = minusMatch[1] || minusMatch[2];
        award = -1;

    } else {
        // No '++' and no '--'; don't continue
        return;
    }

    PlusPlus.processAward(bot, from, toUserName, award);
};

PlusPlus.processAward = function (bot, from, to, award) {
    // In this case, 'from' is stored in the DB's 'name' column
    bot.users.getByName(from, function (err, row) {
        console.log('from', row);
    });

    bot.users.getByFuzzyName(to, function (err, row) {
        console.log('to', row);
    });
};

PlusPlus.getRandomQuip = function (quipList) {
    return quipList[Math.floor(Math.Random() * quipList.length)];
};

module.exports = PlusPlus;
