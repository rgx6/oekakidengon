(function () {
    'use strict';

    var mongoose = require('mongoose');
    var Schema = mongoose.Schema;

    var GameSchema = new Schema({
        name:            { type: String, require: true },
        answer:          { type: String, require: true },
        round_max:       { type: Number, require: true },
        view_time:       { type: Number, require: true },
        draw_time:       { type: Number, require: true },
        answer_time:     { type: Number, require: true },
        creator_id:      { type: Schema.ObjectId, require: true, index: true },
        comment:         { type: String },
        password:        { type: String },
        rounds:          { type: [RoundSchema], require: true },
        is_gameover:     { type: Boolean, require: true },
        registered_time: { type: Date, require: true },
        updated_time:    { type: Date, require: true },
    });
    mongoose.model('Game', GameSchema);

    var RoundSchema = new Schema({
        round:           { type: Number, require: true },
        drawer_id:       { type: Schema.ObjectId, require: true, index: true },
        file_name:       { type: String, require: true },
        like_count:      { type: Number, require: true },
        registered_time: { type: Date, require: true },
        updated_time:    { type: Date, require: true },
    });
    mongoose.model('Round', RoundSchema);

    var PlayerSchema = new Schema({
        name:            { type: String, require: true },
        registered_time: { type: Date, require: true },
        updated_time:    { type: Date, require: true },
    });
    mongoose.model('Player', PlayerSchema);

    var PlayLogSchema = new Schema({
        game_id: { type: Schema.ObjectId, require: true, index: true },
        player_id: { type: Schema.ObjectId, require: true, index: true },
        role: { type: String, require: true },
        registered_time: { type: Date, require: true },
        updated_time:    { type: Date, require: true },
    });
    mongoose.model('PlayLog', PlayLogSchema);

    var AnswerSchema = new Schema({
        game_id:         { type: Schema.ObjectId, require: true, index: true },
        answerer_id:     { type: Schema.ObjectId, require: true, index: true },
        answer:          { type: String, require: true },
        registered_time: { type: Date, require: true },
    });
    mongoose.model('Answer', AnswerSchema);

    var RatingSchema = new Schema({
        game_id:         { type: Schema.ObjectId, require: true, index: true },
        round:           { type: Number, require: true },
        rater_id:        { type: Schema.ObjectId, require: true, index: true },
        registered_time: { type: Date, require: true },
    });
    mongoose.model('Rating', RatingSchema);

    mongoose.connect('mongodb://localhost/OekakiDengon');

    exports.Game = mongoose.model('Game');
    exports.Round = mongoose.model('Round');
    exports.Player = mongoose.model('Player');
    exports.PlayLog = mongoose.model('PlayLog');
    exports.Answer = mongoose.model('Answer');
    exports.Rating = mongoose.model('Rating');
})();
