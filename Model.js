'use strict';

const N = 24;   // grid steps along u and along v


// Neovius' surface
function NeoviusZ(u, v) {
    let c = -3 * (Math.cos(u) + Math.cos(v)) / (3 + 4 * Math.cos(u) * Math.cos(v));
    return Math.acos(Math.max(-1, Math.min(1, c)));     // clamp guards against rounding at the patch edges
}

const PLACEMENTS = [
    (u, v, w) => [u, v,  w],
    (u, v, w) => [u, v, -w],
    (u, v, w) => [ w, u, v],
    (u, v, w) => [-w, u, v],
    (u, v, w) => [v,  w, u],
    (u, v, w) => [v, -w, u]
];


// U polyline: u changes, v = const. V polyline: v changes, u = const.
function CreateSurfaceData() {
    let data = { uLines: [], vLines: [], lineLength: N + 1 };

    for (let place of PLACEMENTS) {
        for (let i = 0; i <= N; i++) {
            let c = -Math.PI / 2 + Math.PI * i / N;         // constant parameter of the polyline

            for (let j = 0; j <= N; j++) {
                let t = -Math.PI / 2 + Math.PI * j / N;     // running parameter

                data.uLines.push(...place(t, c, NeoviusZ(t, c)).map(a => a / 2));
                data.vLines.push(...place(c, t, NeoviusZ(c, t)).map(a => a / 2));
            }
        }
    }
    return data;
}


// Constructor
function Model(name) {
    this.name = name;
    this.iVertexBufferU = gl.createBuffer();    // vertices of all U polylines, one after another
    this.iVertexBufferV = gl.createBuffer();    // vertices of all V polylines, one after another
    this.lineLength = 0;                        // vertices in one polyline
    this.lineCount = 0;                         // polylines in each set

    this.BufferData = function(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBufferU);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.uLines), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBufferV);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vLines), gl.STATIC_DRAW);

        this.lineLength = data.lineLength;
        this.lineCount = data.uLines.length / 3 / data.lineLength;
    }

    this.Draw = function() {
        this.DrawSet(this.iVertexBufferU, [1, 1, 0, 1]);   // U polylines - yellow
        this.DrawSet(this.iVertexBufferV, [0, 1, 1, 1]);   // V polylines - cyan
    }

    // Every polyline is a separate LINE_STRIP, so neighbouring polylines are not connected.
    this.DrawSet = function(buffer, color) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);
        gl.uniform4fv(shProgram.iColor, color);

        for (let i = 0; i < this.lineCount; i++)
            gl.drawArrays(gl.LINE_STRIP, i * this.lineLength, this.lineLength);
    }
}
