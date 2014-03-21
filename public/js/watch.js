(function () {
    'use strict';

    $(document).ready(function () {
        'use strict';

        //------------------------------
        // 定数
        //------------------------------

        var RESULT_OK            = 'ok';
        var RESULT_BAD_PARAM     = 'bad param';
        var RESULT_INVALID_TOKEN = 'invalid token';
    
        var KEY_TOKEN = 'token';

        //------------------------------
        // 変数
        //------------------------------

        var socket;

        var canvas = $('#drawCanvas').get(0);
        var context;

        var answer;

        //------------------------------
        // 準備
        //------------------------------

        if (!canvas.getContext) {
            alert('ブラウザがCanvasに対応してないよ(´・ω・｀)');
            windowClose();
        }

        context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';
        clearCanvas();

        socket = io.connect();

        //------------------------------
        // メッセージハンドラ定義
        //------------------------------

        /**
         * 接続成功
         */
        socket.on('connected', function () {
            'use strict';
            // console.log('connected');

            var data = { token: window.localStorage.getItem(KEY_TOKEN) };
            window.localStorage.removeItem(KEY_TOKEN);

            socket.emit('init watch', data, function (res) {
                // console.log('init watch callback');
                // console.log(res);

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                    windowClose();
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                    windowClose();
                } else if (res.result === RESULT_OK) {
                    answer = res.answer;
                    initRound(res.round, res.roundMax, res.playerName);
                    res.image.forEach(function (imagedata) {
                        drawData(imagedata);
                    });
                } else {
                    alert('予期しないエラーです');
                    windowClose();
                }
            });
        });

        /**
         * お絵かきデータの差分を受け取る
         */
        socket.on('push drawing image', function (data) {
            'use strict';
            // console.log('push drawing image');
            
            drawData(data);
        });

        /**
         * ラウンドの開始通知を受け取る
         */
        socket.on('push init round', function (data) {
            'use strict';
            // console.log('push init round');

            initRound(data.round, data.roundMax, data.playerName);
        });

        /**
         * canvasをクリアする
         */
        socket.on('push clear canvas', function () {
            'use strict';
            // console.log('push clear canvas');
            
            clearCanvas();
        });

        //------------------------------
        // その他 イベントハンドラ
        //------------------------------

        /**
         * 答えを見るボタン クリックイベント
         */
        $('#showAnswer').on('click', function (e) {
            'use strict';
            // console.log('#answer click');
            e.stopPropagation();

            $('#showAnswer').css('display', 'none');
            $('#answer').text('答え ： ' + answer);
        });

        /**
         * 戻るボタン クリックイベント
         */
        $('#exit').on('click', function (e) {
            'use strict';
            // console.log('#exit click');
            e.stopPropagation();

            windowClose();
        });

        //------------------------------
        // 関数
        //------------------------------

        /**
         * ラウンドの初期化
         */
        function initRound (round, roundMax, playerName) {
            'use strict';
            // console.log('initRound');

            clearCanvas();
            $('#round').text(round + ' / ' + roundMax);
            $('#drawer').text('描く人 ： ' + playerName);
        }

        /**
         * windowを閉じる
         */
        function windowClose () {
            'use strict';
            // console.log('windowClose');

            parent.$.fn.colorbox.close();
        }

        //------------------------------
        // 関数(お絵かき)
        //------------------------------

        /**
         * 受け取ったお絵かきデータを描画メソッドに振り分ける
         */
        function drawData (data) {
            'use strict';
            // console.log('drawData');

            for (var i = 0; i < data.length; i += 1) {
                var width = data[i].width;
                var color = data[i].color;
                var x = data[i].x;
                var y = data[i].y;
                for (var j = 0; j < x.length; j += 1) {
                    if (x[j].length === 1) {
                        drawPoint(x[j][0], y[j][0], width, color);
                    } else {
                        drawLine(x[j], y[j], width, color);
                    }
                }
            }
        }

        /**
         * Canvas 線分を描画する
         */
        function drawLine (x, y, width, color) {
            'use strict';
            // console.log('drawLine');

            var offset = width % 2 === 0 ? 0 : 0.5;
            context.strokeStyle = color;
            context.fillStyle = color;
            context.lineWidth = width;
            context.beginPath();
            context.moveTo(x[0] - offset, y[0] - offset);
            for (var i = 1; i < x.length; i += 1) {
                context.lineTo(x[i] - offset, y[i] -offset);
            }
            context.stroke();
        }

        /**
         * Canvas 点を描画する
         */
        function drawPoint (x, y, width, color) {
            'use strict';
            // console.log('drawPoint');

            // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
            context.strokeStyle = color;
            context.fillStyle = color;
            context.beginPath();
            context.arc(x, y, width / 2, 0, Math.PI * 2, false);
            context.fill();
        }

        /**
         * Canvas クリア
         */
        function clearCanvas () {
            'use strict';
            // console.log('#clearCanvas');

            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, $('#drawCanvas').width(), $('#drawCanvas').height());
        }

    });
})();
