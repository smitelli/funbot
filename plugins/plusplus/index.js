'use strict';

// Based on https://github.com/jaredklett/PlusPlusBot

var format   = require('util').format,
    async    = require('async'),
    PlusPlus = {};

PlusPlus.THROTTLE_LIMIT = 10;  //cooldown delay before awarding again (seconds)

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

    var plusMatch  = message.match(/\s\+\+\s*@?(\w+)|@?(\w+)\s*\+\+\s/),
        minusMatch = message.match(/\s--\s*@?(\w+)|@?(\w+)\s*--\s/),
        toName,
        award;

    if (plusMatch && minusMatch) {
        // Both a '++'' and a '--'; ignore the whole thing
        return;

    } else if (plusMatch) {
        // user++ or ++user
        toName = plusMatch[1] || plusMatch[2];
        award  = 1;

    } else if (minusMatch) {
        // user-- or --user
        toName = minusMatch[1] || minusMatch[2];
        award  = -1;

    } else {
        // No '++' and no '--'; don't continue
        return;
    }

    PlusPlus.processAward(this, channel, from, toName, award);
};

PlusPlus.processAward = function (bot, channel, from, to, award) {
    var fromUser,
        toUser;

    async.waterfall([
        function (cb) {
            // In this case, 'from' is stored in the DB's 'name' column
            bot.users.getByName(from, cb);
        },

        function (result, cb) {
            var err;

            if (!result) {
                err = PlusPlus.getErr("Sorry %s, but I don't recognize your name!", from);
                return cb(err, null);
            }

            fromUser = result;

            // Make sure the user giving the points exists in the data table
            bot.db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', fromUser.id, cb);
        },

        function (cb) {
            bot.db.all(
                'SELECT * FROM `plusplus_data` WHERE `users_id` = $id ' +
                'AND `last_award` > strftime("%s", "now") - $lim',
                {
                    $id  : fromUser.id,
                    $lim : PlusPlus.THROTTLE_LIMIT
                },
                cb
            );
        },

        function (throttleResult, cb) {
            var err;

            if (throttleResult.length) {
                err = PlusPlus.getErr(PlusPlus.getThrottleMessage(throttleResult[0].award_tries));

                bot.db.run(
                    'UPDATE `plusplus_data` SET `award_tries` = `award_tries` + 1 ' +
                    'WHERE `users_id` = ?', throttleResult[0].users_id
                );

                return cb(err, null);
            }

            bot.db.run(
                'UPDATE `plusplus_data` SET `award_tries` = 0, last_award = strftime("%s", "now") ' +
                'WHERE `users_id` = ?', fromUser.id,
                cb
            );
        },

        function (cb) {
            bot.users.getByFuzzyName(to, cb);
        },

        function (result, cb) {
            var action = (award > 0 ? 'award yourself' : 'decrement your own'),
                err;

            // We don't need to check for result.length === 0, since
            // getByFuzzyName() will call the errback in that case.
            toUser = result;

            if (fromUser.id === toUser.id) {
                err = PlusPlus.getErr("Sorry @%s, you can't %s points.", fromUser.mention_name, action);
                return cb(err, null);
            }

            // Make sure the user receiving the points exists in the data table
            bot.db.run('INSERT OR IGNORE INTO `plusplus_data` (`users_id`) VALUES(?)', toUser.id, cb);
        },

        function (cb) {
            bot.db.run(
                'UPDATE `plusplus_data` SET `score` = `score` + $award WHERE `users_id` = $users_id',
                {
                    $award    : award,
                    $users_id : toUser.id
                },
                cb
            );
        },

        function (cb) {
            bot.db.get('SELECT * FROM `plusplus_data` WHERE `users_id` = ?', toUser.id, cb);
        }
    ], function (err, result) {
        var response;

        if (err) {
            response = err.message;
        } else if (award > 0) {
            response = PlusPlus.getBumpMessage(toUser.mention_name, result.score);
        } else {
            response = PlusPlus.getDissMessage(toUser.mention_name, result.score);
        }

        bot.message(channel, response);
    });
};

PlusPlus.getErr = function () {
    var message = format.apply(null, arguments);

    return new Error(message);
};

PlusPlus.getThrottleMessage = function (tries) {
    var messages = [
        "Sorry, you're trying to award too fast.",
        "Seriously, slow your roll.",
        "Now you're just embarassing yourself."
    ];

    return messages[tries % messages.length];
};

PlusPlus.getBumpMessage = function (toMentionName, score) {
    var messages = [
        "w00t! @%s now at %d!",
        "nice! @%s now at %d!",
        "suh-weet! @%s now at %d!",
        "well played! @%s now at %d!",
        "zing! @%s now at %d!",
        "you go girl! @%s now at %d!",
        "booyakasha! @%s now at %d!",
        "heyoooo! @%s now at %d!",
        "sweet! @%s now at %d!",
        "fist bump! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

PlusPlus.getDissMessage = function (toMentionName, score) {
    var messages = [
        "ouch! @%s now at %d!",
        "daaaang! @%s now at %d!",
        "denied! @%s now at %d!",
        "ooooh! @%s now at %d!",
        "owie! @%s now at %d!",
        "awwww snap! @%s now at %d!",
        "ya dun goofed! @%s now at %d!",
        "boom! @%s now at %d!",
        "oh no you did not! @%s now at %d!"
    ];

    return format(messages[Math.floor(Math.random() * messages.length)], toMentionName, score);
};

module.exports = PlusPlus;
