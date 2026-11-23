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


function Vertex(p, t) {
    this.p = p;             // xyz
    this.t = t;             // texture coordinates st
    this.normal = [];
    this.tangent = [];
    this.triangles = [];    // indices of the triangles that share this vertex
}

function Triangle(v0, v1, v2) {
    this.v0 = v0;           // vertex indices
    this.v1 = v1;
    this.v2 = v2;
    this.normal = [];
    this.tangent = [];
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
                // the whole texture is stretched over every patch
                vertices.push(new Vertex(place(u, v, NeoviusZ(u, v)).map(a => a / 2), [i / uSteps, j / vSteps]));
            }
        }

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

    for (let t of triangles) {
        let a = vertices[t.v0], b = vertices[t.v1], c = vertices[t.v2];
        let e1 = m4.subtractVectors(b.p, a.p);
        let e2 = m4.subtractVectors(c.p, a.p);

        // Facet normal: normalized cross product of two edges of the triangle
        t.normal = m4.normalize(m4.cross(e1, e2));

        // Facet tangent: direction in which the texture coordinate s grows.
        // e1 = ds1*T + dt1*B,  e2 = ds2*T + dt2*B   =>   T = (dt2*e1 - dt1*e2) / (ds1*dt2 - ds2*dt1)
        let ds1 = b.t[0] - a.t[0], dt1 = b.t[1] - a.t[1];
        let ds2 = c.t[0] - a.t[0], dt2 = c.t[1] - a.t[1];
        let T = m4.subtractVectors(m4.scaleVector(e1, dt2), m4.scaleVector(e2, dt1));
        t.tangent = m4.normalize(m4.scaleVector(T, 1 / (ds1 * dt2 - ds2 * dt1)));
    }

    // Facet average: vertex normal (tangent) = normalized sum of the normals (tangents) of the adjacent triangles
    for (let v of vertices) {
        let normal = [0, 0, 0], tangent = [0, 0, 0];
        for (let t of v.triangles) {
            normal  = m4.addVectors(normal,  triangles[t].normal);
            tangent = m4.addVectors(tangent, triangles[t].tangent);
        }
        v.normal  = m4.normalize(normal);
        v.tangent = m4.normalize(tangent);
    }

    // 16-bit indices are enough: at most 6 * 101 * 101 = 61206 vertices (sliders go up to 100)
    let data = {
        vertices:  new Float32Array(vertices.length * 3),
        normals:   new Float32Array(vertices.length * 3),
        tangents:  new Float32Array(vertices.length * 3),
        texCoords: new Float32Array(vertices.length * 2),
        indices:   new Uint16Array(triangles.length * 3)
    };
    vertices.forEach((v, i) => {
        data.vertices.set(v.p, i * 3);
        data.normals.set(v.normal, i * 3);
        data.tangents.set(v.tangent, i * 3);
        data.texCoords.set(v.t, i * 2);
    });
    triangles.forEach((t, i) => data.indices.set([t.v0, t.v1, t.v2], i * 3));

    return data;
}


// Constructor
function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iNormalBuffer = gl.createBuffer();
    this.iTangentBuffer = gl.createBuffer();
    this.iTexCoordsBuffer = gl.createBuffer();
    this.iIndexBuffer = gl.createBuffer();
    this.count = 0;                             // number of indices

    // Texture identifiers
    this.idTextureDiffuse  = -1;
    this.idTextureSpecular = -1;
    this.idTextureNormal   = -1;

    this.BufferData = function(data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTangentBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.tangents, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.texCoords, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        this.count = data.indices.length;
    }

    this.Draw = function() {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureDiffuse);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureSpecular);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.idTextureNormal);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iNormalBuffer);
        gl.vertexAttribPointer(shProgram.iAttribNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribNormal);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTangentBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTangent, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTangent);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordsBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexCoords, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoords);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iIndexBuffer);
        gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
    }
}
