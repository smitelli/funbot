'use strict';

var lodash  = require('lodash'),
    helpers = require('./helpers'),
    Rooms   = function (bot) {
        this.bot = bot;
        this.db  = bot.db;
    };

Rooms.prototype.refresh = function (callback) {
    var db = this.db,
        cb = lodash.bind(callback || lodash.noop, this.bot);

    this.bot.getRooms(function(err, rooms) {
        if (err) {
            return;
        }

        db.serialize(function () {
            db.run('UPDATE `rooms` SET `touched` = 0');

            rooms.forEach(function (room) {
                db.run(
                    'INSERT OR REPLACE INTO `rooms` (`id`, `jid`, `users_id`, `name`, `topic`, `guest_url`, ' +
                    '`num_participants`, `privacy`, `is_archived`, `touched`) ' +
                    'VALUES($id, $jid, $users_id, $name, $topic, $guest_url, ' +
                    '$num_participants, $privacy, $is_archived, 1)',
                    {
                        $id               : room.id,
                        $jid              : room.jid,
                        $users_id         : helpers.jidToUserId(room.owner),
                        $name             : room.name,
                        $topic            : room.topic || null,
                        $guest_url        : room.guest_url || null,
                        $num_participants : room.num_participants,
                        $privacy          : room.privacy,
                        $is_archived      : room.is_archived.toString()
                    }
                );
            });

            db.run('DELETE FROM `rooms` WHERE `touched` = 0', cb);
        });
    });
};

Rooms.prototype.autoJoin = function () {
    this.db.each(
        'SELECT `rooms`.`jid` FROM `room_presence` ' +
        'LEFT JOIN `rooms` ON `room_presence`.`rooms_id` = `rooms`.`id` ' +
        'WHERE `rooms`.`jid` IS NOT NULL',
        lodash.bind(function (err, row) {
            this.bot.join(row.jid);
        }, this)
    );
};

Rooms.prototype.join = function (roomJid, inviterJid) {
    this.db.run(
        'INSERT OR REPLACE INTO `room_presence` (`rooms_id`, `invited_by`) ' +
        'SELECT `id`, $invited_by FROM `rooms` WHERE `jid` = $room_jid',
        {
            $room_jid   : roomJid,
            $invited_by : helpers.jidToUserId(inviterJid)
        }
    );

    this.bot.join(roomJid);
};

module.exports = Rooms;
