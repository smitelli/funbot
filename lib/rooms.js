'use strict';

var Rooms = function (bot) {
    this.db = bot.db;
};

Rooms.prototype.refresh = function (rooms) {
    rooms.forEach(function (room) {
        var ownerParts = room.owner.match(/^(\d+)_(\d+)@.+$/);

        // If we can't extract a numeric ID for the owner, skip this room
        if (!ownerParts) {
            return;
        }

        this.db.run(
            'INSERT OR REPLACE INTO `rooms` (`id`, `jid`, `users_id`, `name`, `topic`, `guest_url`, ' +
            '`num_participants`, `privacy`, `is_archived`) ' +
            'VALUES($id, $jid, $users_id, $name, $topic, $guest_url, $num_participants, $privacy, $is_archived)',
            {
                $id               : room.id,
                $jid              : room.jid,
                $users_id         : ownerParts[2],
                $name             : room.name,
                $topic            : room.topic || null,
                $guest_url        : room.guest_url || null,
                $num_participants : room.num_participants,
                $privacy          : room.privacy,
                $is_archived      : room.is_archived.toString()
            }
        );
    }, this);
};

module.exports = Rooms;
