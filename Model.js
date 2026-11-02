'use strict';

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


function Vertex(p) {
    this.p = p;             // xyz
    this.normal = [];
    this.triangles = [];    // indices of the triangles that share this vertex
}

function Triangle(v0, v1, v2) {
    this.v0 = v0;           // vertex indices
    this.v1 = v1;
    this.v2 = v2;
    this.normal = [];
}


// uSteps x vSteps grid cells on every patch, two triangles per cell
function CreateSurfaceData(uSteps, vSteps) {
    let vertices = [];
    let triangles = [];

    function AddTriangle(v0, v1, v2) {
        let t = triangles.length;
        triangles.push(new Triangle(v0, v1, v2));
        vertices[v0].triangles.push(t);
        vertices[v1].triangles.push(t);
        vertices[v2].triangles.push(t);
    }

    for (let place of PLACEMENTS) {
        let first = vertices.length;    // index of the first vertex of this patch

        for (let i = 0; i <= uSteps; i++) {
            let u = -Math.PI / 2 + Math.PI * i / uSteps;
            for (let j = 0; j <= vSteps; j++) {
                let v = -Math.PI / 2 + Math.PI * j / vSteps;
                vertices.push(new Vertex(place(u, v, NeoviusZ(u, v)).map(a => a / 2)));
            }
        }

        // v0    v2      v0 = (i, j)      v2 = (i, j+1)
        //   o - o
        //   | \ |
        //   o - o
        // v3    v1      v3 = (i+1, j)    v1 = (i+1, j+1)
        for (let i = 0; i < uSteps; i++) {
            for (let j = 0; j < vSteps; j++) {
                let v0 = first + i * (vSteps + 1) + j;
                let v2 = v0 + 1;
                let v3 = v0 + vSteps + 1;
                let v1 = v3 + 1;
                AddTriangle(v0, v1, v2);
                AddTriangle(v0, v3, v1);
            }
        }
    }

    // Facet normal: normalized cross product of two edges of the triangle
    for (let t of triangles) {
        let p0 = vertices[t.v0].p, p1 = vertices[t.v1].p, p2 = vertices[t.v2].p;
        t.normal = m4.normalize(m4.cross(m4.subtractVectors(p1, p0), m4.subtractVectors(p2, p0)));
    }

    // Facet average: vertex normal = normalized sum of the normals of the adjacent triangles
    for (let v of vertices) {
        let sum = [0, 0, 0];
        for (let t of v.triangles)
            sum = m4.addVectors(sum, triangles[t].normal);
        v.normal = m4.normalize(sum);
    }

    // 16-bit indices are enough: at most 6 * 101 * 101 = 61206 vertices (sliders go up to 100)
    let data = {
        vertices: new Float32Array(vertices.length * 3),
        normals:  new Float32Array(vertices.length * 3),
        indices:  new Uint16Array(triangles.length * 3)
    };
    vertices.forEach((v, i) => {
        data.vertices.set(v.p, i * 3);
        data.normals.set(v.normal, i * 3);
    });
    triangles.forEach((t, i) => data.indices.set([t.v0, t.v1, t.v2], i * 3));

    return data;
}


// Constructor
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iNormalBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;                             // number of indices

    this.BufferData = function(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        this.count = data.indices.length;
    }

    this.Draw = function() {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    }
}
