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

        // socket.io オブジェクト
        var socket;
        // 時間管理用タイマーオブジェクト
        var timer;
        // 残り時間(秒)
        var timeLeft;

        // お絵かきデータの定期送信用タイマーオブジェクト
        // var timer;
        // お絵かきデータの送信間隔(ミリ秒)
        // var setTimeoutMillisecond = 500;

        // お絵かきの変数

        // 描画の始点
        var startX;
        var startY;

        // 描画する色
        var color = '#000000';
        // 描画する線の太さ
        // hack : .selectedSizeを見て初期化する
        var drawWidth = 3;

        // 描画中フラグ
        var isDrawing = false;

        // canvas
        var canvas = $('#drawCanvas').get(0);
        var cursorCanvas = $('#cursorCanvas').get(0);
        var context;
        var cursorContext;

        // お絵かきデータのbuffer
        // var buffer = [];
        // お絵かきデータ送信用のタイマーがセットされているか
        // var isBuffering = false;

        // 操作可否フラグ
        var isOperable = false;

        // サムネイルのサイズ
        var thumbnailSize = 160;

        // ゲーム接続数
        // var userCount = 0;

        var token;
        var answer;
        var fileName;
        var viewTime;
        var drawTime;

        //------------------------------
        // 準備
        //------------------------------

        // Canvas 対応確認
        if (!canvas.getContext) {
            alert('ブラウザがCanvasに対応してないよ(´・ω・｀)');
            windowClose();
        }

        context = canvas.getContext('2d');
        context.lineCap = 'round';
        context.lineJoin = 'round';
        clearCanvas();

        cursorContext = cursorCanvas.getContext('2d');

        // ボタン非表示
        $('#viewDone').css('display', 'none');
        $('#drawDone').css('display', 'none');

        // ブラシサイズ初期化
        initBrushSizeCanvas();

        // パレット選択色初期化
        changePalletSelectedBorderColor();

        // サーバ接続
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

            socket.emit('init draw', data, function (res) {
                // console.log('init draw callback');
                // console.log(data);

                if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                    windowClose();
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                    windowClose();
                } else if (res.result === RESULT_OK) {
                    token = res.token;
                    answer = res.answer;
                    fileName = res.fileName;
                    viewTime = res.viewTime;
                    drawTime = res.drawTime;
                    if (res.isFirstRound) {
                        initFirstRound();
                    } else {
                        initNotFirstRound();
                    }
                } else {
                    alert('予期しないエラーです');
                    windowClose();
                }
            });
        });

        //------------------------------
        // Canvas イベントハンドラ
        //------------------------------

        /**
         * Canvas MouseDown イベント
         */
        $('#canvas').mousedown(function (e) {
            'use strict';
            // console.log('#canvas mouse down');
            e.stopPropagation();
            if (!isOperable) return;

            isDrawing = true;
            startX = Math.round(e.pageX) - $('#drawCanvas').offset().left;
            startY = Math.round(e.pageY) - $('#drawCanvas').offset().top;
            drawPoint(startX, startY, drawWidth, color);
            // pushBuffer('point', drawWidth, color, { x: startX, y: startY });

            // Chromeで描画中のマウスカーソルが I になるのを防ぐ。
            return false;
        });

        /**
         * Canvas MouseMove イベント
         */
        $('#canvas').mousemove(function (e) {
            'use strict';
            // console.log('#canvas mouse move');
            e.stopPropagation();
            if (!isOperable) return;

            var endX = Math.round(e.pageX) - $('#drawCanvas').offset().left;
            var endY = Math.round(e.pageY) - $('#drawCanvas').offset().top;

            if (!isDrawing) return drawCursor(endX, endY);

            drawLine([startX, endX], [startY, endY], drawWidth, color);
            // pushBuffer('line', drawWidth, color, { xs: startX, ys: startY, xe: endX, ye: endY });
            startX = endX;
            startY = endY;
        });

        /**
         * Canvas MouseUp イベント
         */
        $('#canvas').mouseup(function (e) {
            'use strict';
            // console.log('#canvas mouse up');
            e.stopPropagation();
            if (!isOperable) return;

            isDrawing = false;
        });

        /**
         * Canvas MouseLeave イベント
         */
        $('#canvas').mouseleave(function (e) {
            'use strict';
            // console.log('#canvas mouse leave');
            e.stopPropagation();
            if (!isOperable) return;

            isDrawing = false;
            clearCursor();
        });

        //------------------------------
        // その他 イベントハンドラ
        //------------------------------

        /**
         * 描くボタン クリックイベント
         */
        $('#viewDone').on('click', function (e) {
            'use strict';
            // console.log('#viewDone click');
            e.stopPropagation();

            timeLeft = 0;
            roundView();
        });

        /**
         * 送信ボタン クリックイベント
         */
        $('#drawDone').on('click', function (e) {
            'use strict';
            // console.log('#drawDone click');
            e.stopPropagation();

            timeLeft = 0;
            roundDraw();
        });

        /**
         * 中断ボタン クリックイベント
         */
        $('#exit').on('click', function (e) {
            'use strict';
            // console.log('#exit click');
            e.stopPropagation();

            clearInterval(timer);

            var data = { token: token };
            socket.emit('exit game', data, function () {});
            alert('ゲームを中断しました');
            windowClose();
        });

        /**
         * 色選択
         */
        $('#pallet>div').on('click', function (e) {
            'use strict';
            // console.log('#pallet>div click');
            e.stopPropagation();
            if (!isOperable) return;

            $('#pallet>div.selectedColor').removeClass('selectedColor');
            $(this).addClass('selectedColor');

            $('#pallet>div').css('border-color', $('#header').css('background-color'));
            changePalletSelectedBorderColor();
            color = $(this).css('background-color');
        });

        /**
         * ブラシサイズ選択
         */
        $('#brushSize>canvas').on('click', function (e) {
            'use strict';
            // console.log('#brushSize>canvas click');
            e.stopPropagation();
            if (!isOperable) return;

            $('#brushSize>canvas.selectedSize').removeClass('selectedSize');
            $(this).addClass('selectedSize');

            $(this).attr('id').match(/brush(\d+)/);
            drawWidth = Number(RegExp.$1);
        });

        /**
         * クリアボタン クリック
         */
        $('#clear').on('click', function (e) {
            'use strict';
            // console.log('#clear click');
            e.stopPropagation();
            if (!isOperable) return;

            // bufferを破棄
            // buffer.length = 0;
            // isBuffering = false;

            // 描画不可
            isOperable = false;
            clearCanvas();            
            // socket.emit('clear canvas');
            isOperable = true;
        });

        //------------------------------
        // 関数
        //------------------------------

        /**
         * ラウンドの初期化(最初のラウンド)
         */
        function initFirstRound () {
            'use strict';
            // console.log('initFirstRound');

            timeLeft = drawTime;
            dispTimeLeft();

            var message = '「' + answer + '」の絵を描いてください\n\n';
            message += '制限時間： ' + drawTime + ' 秒';
            alert(message);

            $('#drawDone').css('display', '');

            isOperable = true;
            timer = setInterval(roundDraw, 1000);
        }

        /**
         * ラウンドの初期化(2ラウンド以降)
         */
        function initNotFirstRound () {
            'use strict';
            // console.log('initNotFirstRound');

            timeLeft = viewTime;
            dispTimeLeft();

            var image = new Image();
            image.src = '/log/' + fileName + '.png?' + new Date().getTime();
            image.onload = function () {
                var message = '前の人が描いた絵を表示します\n\n';
                message += '制限時間： ' + viewTime + ' 秒';
                alert(message);

                $('#viewDone').css('display', '');

                context.drawImage(image, 0, 0);

                timer = setInterval(roundView, 1000);
            }
        }

        /**
         * ラウンド中の処理(見る)
         */
        function roundView () {
            'use strict';
            // console.log('roundView');

            timeLeft = timeLeft - 1;
            dispTimeLeft();

            if (timeLeft > 0) return;

            clearInterval(timer);

            clearCanvas();

            timeLeft = drawTime;
            dispTimeLeft();

            var message = '前の人が描いたものを次の人に伝えてください\n\n';
            message += '制限時間： ' + drawTime + ' 秒';
            alert(message);

            $('#drawDone').css('display', '');
            $('#viewDone').css('display', 'none');

            isOperable = true;
            timer = setInterval(roundDraw, 1000);
        }

        /**
         * ラウンド中の処理(描く)
         */
        function roundDraw () {
            'use strict';
            // console.log('roundDraw');

            timeLeft = timeLeft - 1;
            dispTimeLeft();

            if (timeLeft > 0) return;

            isOperable = false;
            clearInterval(timer);

            var data = {
                token:        token,
                png:          getPng(),
                thumbnailPng: getThumbnailPng(),
            };
            socket.emit('send image', data, function (res) {
                'use strict';
                // console.log('send image callback');
                // console.log(res);

                if (res.result === RESULT_OK) {
                    alert('絵を送信しました');
                } else if (res.result === RESULT_BAD_PARAM) {
                    alert('不正なパラメータです');
                } else if (res.result === RESULT_INVALID_TOKEN) {
                    alert('不正なトークンです');
                } else {
                    alert('予期しないエラーです');
                }
                windowClose();
            });
        }

        /**
         * 残り時間表示
         */
        function dispTimeLeft () {
            'use strict';
            // console.log('dispTimeLeft');

            $('#timeLeft label').text('残り時間 ： ' + (timeLeft >= 0 ? timeLeft : 0) + ' 秒');
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
         * ブラシサイズのCanvasを初期化する
         */
        function initBrushSizeCanvas () {
            'use strict';
            // console.log('initBrushSizeCanvas');

            $('#brushSize>canvas').each(function () {
                var context = this.getContext('2d');
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, $(this).width(), $(this).height());

                $(this).attr('id').match(/brush(\d+)/);
                var drawWidth = Number(RegExp.$1);

                $(this).attr('width').match(/(\d+)/);
                var x = Math.round(RegExp.$1 / 2);

                context.strokeStyle = '#000000';
                context.fillStyle = '#000000';
                context.beginPath();
                // IEとChromeではlineToで点を描画できないようなので、多少ぼやけるがarcを使う。
                context.arc(x, x, drawWidth / 2, 0, Math.PI * 2, false);
                context.fill();
            });
        }

        /**
         * パレットの選択色の枠の色を設定する
         */
        function changePalletSelectedBorderColor () {
            'use strict';
            // console.log('changePalletBorderColor');

            var tempColor;
            $('#pallet>div.selectedColor').css('background-color').match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
            if (Number(RegExp.$1) + Number(RegExp.$2) + Number(RegExp.$3) < 600) {
                tempColor = '#ffffff';
            } else {
                tempColor = '#000000';
            }
            $('#pallet>div.selectedColor').css('border-color', tempColor);
        }

        /**
         * Canvas カーソル表示
         */
        function drawCursor (x, y) {
            'use strict';
            // console.log('drawCursor');

            clearCursor();

            cursorContext.strokeStyle = color;
            cursorContext.fillStyle = color;
            cursorContext.beginPath();
            cursorContext.arc(x, y, drawWidth / 2, 0, Math.PI * 2, false);
            cursorContext.fill();            
        }

        /**
         * Canvas カーソルクリア
         */
        function clearCursor () {
            'use strict';
            // console.log('clearCursor');

            cursorContext.clearRect(0, 0, $('#cursorCanvas').width(), $('#cursorCanvas').height());
        }

        /**
         * Canvas 線分を描画する
         */
        function drawLine (x, y, width, color) {
            'use strict';
            // console.log('drawLine');

            var offset = drawWidth % 2 === 0 ? 0 : 0.5;
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

        /**
         * お絵かき情報をbufferに溜める
         */
        // todo : 実装
        // function pushBuffer (type, width, color, data) {
        //     'use strict';
        //     // console.log('pushBuffer');

        //     if (buffer.length > 0 &&
        //         buffer.slice(-1)[0].width === width &&
        //         buffer.slice(-1)[0].color === color) {
        //         if (type === 'line') {
        //             buffer.slice(-1)[0].x.slice(-1)[0].push(data.xe);
        //             buffer.slice(-1)[0].y.slice(-1)[0].push(data.ye);
        //         } else if (type === 'point') {
        //             buffer.slice(-1)[0].x.push( [data.x] );
        //             buffer.slice(-1)[0].y.push( [data.y] );
        //         }
        //     } else {
        //         if (type === 'line') {
        //             buffer.push({
        //                 width: width,
        //                 color: color,
        //                 x: [ [data.xs, data.xe] ],
        //                 y: [ [data.ys, data.ye] ] });
        //         } else if (type === 'point') {
        //             buffer.push({
        //                 width: width,
        //                 color: color,
        //                 x: [ [data.x] ],
        //                 y: [ [data.y] ] });
        //         }
        //     }

        //     if (!isBuffering) {
        //         // console.log('isBuffering');

        //         isBuffering = true;
        //         timer = setTimeout(function () { sendImage(); }, setTimeoutMillisecond);
        //     }
        // }

        /**
         * bufferを送信する
         */
        // todo : 実装
        // function sendImage () {
        //     'use strict';
        //     // console.log('sendImage');

        //     socket.emit('send image', buffer);
        //     buffer.length = 0;
        //     isBuffering = false;
        // }

        /**
         * 画像DataUrl取得メソッド
         */
        function getPng () {
            'use strict';
            // console.log('getPng');

            var dataUrl = canvas.toDataURL('image/png');
            return dataUrl.split(',')[1];
        }

        /**
         * サムネイル画像DataUrl取得メソッド
         */
        function getThumbnailPng () {
            'use strict';
            // console.log('getThumbnailPng');

            var thumbnailCanvas = document.createElement('canvas');

            var rate;
            if (canvas.width >= canvas.height) {
                rate = canvas.width / thumbnailSize;
                thumbnailCanvas.width = thumbnailSize;
                thumbnailCanvas.height = Math.floor(canvas.height / rate);
            } else {
                rate = canvas.height / thumbnailSize;
                thumbnailCanvas.width = Math.floor(canvas.width / rate);
                thumbnailCanvas.height = thumbnailSize;
            }

            var thumbnailContext = thumbnailCanvas.getContext('2d');
            thumbnailContext.drawImage(canvas, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);

            var dataUrl = thumbnailCanvas.toDataURL('image/png');
            return dataUrl.split(',')[1];
        }
    });
})();
