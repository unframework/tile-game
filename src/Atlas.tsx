import React, { useRef, useState, useMemo } from 'react';
import { useUpdate, useResource, useFrame } from 'react-three-fiber';
import * as THREE from 'three';

const atlasWidth = 128;
const atlasHeight = 128;

const itemSizeU = 0.1;
const itemSizeV = 0.1;
const itemUVMargin = 0.025;

// maximum physical dimension of a stored item's face
const atlasItemMaxDim = 5;

const itemsPerRow = Math.floor(1 / (itemSizeU + itemUVMargin));

function computeFaceUV(
  atlasFaceIndex: number,
  faceIndex: number,
  posArray: ArrayLike<number>
) {
  const itemColumn = atlasFaceIndex % itemsPerRow;
  const itemRow = Math.floor(atlasFaceIndex / itemsPerRow);

  // get face vertex positions
  const facePosStart = faceIndex * 4 * 3;
  const facePosOrigin = facePosStart + 2 * 3;
  const facePosU = facePosStart + 3 * 3;
  const facePosV = facePosStart;

  const ox = posArray[facePosOrigin];
  const oy = posArray[facePosOrigin + 1];
  const oz = posArray[facePosOrigin + 2];

  // compute face dimension
  const dU = new THREE.Vector3(
    posArray[facePosU] - ox,
    posArray[facePosU + 1] - oy,
    posArray[facePosU + 2] - oz
  );

  const dV = new THREE.Vector3(
    posArray[facePosV] - ox,
    posArray[facePosV + 1] - oy,
    posArray[facePosV + 2] - oz
  );

  const dUdim = Math.min(atlasItemMaxDim, dU.length());
  const dVdim = Math.min(atlasItemMaxDim, dV.length());

  const left = itemColumn * (itemSizeU + itemUVMargin);
  const top = itemRow * (itemSizeV + itemUVMargin);
  const right = left + itemSizeU * (dUdim / atlasItemMaxDim);
  const bottom = top + itemSizeV * (dVdim / atlasItemMaxDim);

  return { left, top, right, bottom };
}

function createAtlasTexture(
  atlasWidth: number,
  atlasHeight: number,
  fillWithPattern?: boolean
) {
  const atlasSize = atlasWidth * atlasHeight;
  const data = new Uint8Array(3 * atlasSize);

  if (fillWithPattern) {
    // pre-fill with a test pattern
    for (let i = 0; i < atlasSize; i++) {
      const x = i % atlasWidth;
      const y = Math.floor(i / atlasWidth);

      const stride = i * 3;

      const v = x % 8 === 0 || y % 8 === 0 ? 0 : 255;
      data[stride] = v;
      data[stride + 1] = v;
      data[stride + 2] = v;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    atlasWidth,
    atlasHeight,
    THREE.RGBFormat
  );

  return { data, texture };
}

export interface AtlasItem {
  mesh: THREE.Mesh;
  buffer: THREE.BufferGeometry;
  faceIndex: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  pixelFillCount: number;
}

export function useMeshWithAtlas(
  atlasInfo: AtlasItem[],
  meshBuffer: THREE.BufferGeometry | undefined
) {
  const meshRef = useUpdate<THREE.Mesh>(
    (mesh) => {
      // wait until geometry buffer is initialized
      if (!meshBuffer) {
        return;
      }

      const posAttr = meshBuffer.attributes.position;
      const uvAttr = meshBuffer.attributes.uv;

      const faceCount = posAttr.count / 4;

      for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
        const atlasFaceIndex = atlasInfo.length;
        const { left, top, right, bottom } = computeFaceUV(
          atlasFaceIndex,
          faceIndex,
          posAttr.array
        );

        // default is [0, 1, 1, 1, 0, 0, 1, 0]
        const uvItemBase = faceIndex * 4;
        uvAttr.setXY(uvItemBase, left, bottom);
        uvAttr.setXY(uvItemBase + 1, right, bottom);
        uvAttr.setXY(uvItemBase + 2, left, top);
        uvAttr.setXY(uvItemBase + 3, right, top);

        atlasInfo.push({
          mesh: mesh,
          buffer: meshBuffer,
          faceIndex,
          left,
          top,
          right,
          bottom,
          pixelFillCount: 0
        });
      }
    },
    [meshBuffer]
  );

  return meshRef;
}

export function useAtlas(): {
  atlasInfo: AtlasItem[];
  outputTexture: THREE.Texture;
  lightSceneRef: React.MutableRefObject<THREE.Scene>;
  lightSceneTexture: THREE.Texture;
  probeDebugTexture: THREE.Texture;
} {
  const [lightSceneRef, lightScene] = useResource<THREE.Scene>();

  const [atlasStack, setAtlasStack] = useState(() => [
    createAtlasTexture(atlasWidth, atlasHeight, true),
    createAtlasTexture(atlasWidth, atlasHeight)
  ]);

  const atlasInfo: AtlasItem[] = useMemo(() => [], []);

  const probeTargetSize = 32;
  const probeTarget = useMemo(() => {
    return new THREE.WebGLRenderTarget(probeTargetSize, probeTargetSize);
  }, []);

  const probeCam = useMemo(() => {
    const rtFov = 90; // full near-180 FOV actually works poorly
    const rtAspect = 1; // square render target
    const rtNear = 0.05;
    const rtFar = 10;
    return new THREE.PerspectiveCamera(rtFov, rtAspect, rtNear, rtFar);
  }, []);

  const probeData = useMemo(() => {
    return new Uint8Array(probeTargetSize * probeTargetSize * 4);
  }, []);

  const probeDebugTexture = useMemo(() => {
    return new THREE.DataTexture(
      probeData,
      probeTargetSize,
      probeTargetSize,
      THREE.RGBAFormat
    );
  }, [probeData]);

  const atlasFaceFillIndexRef = useRef(4); // @todo use 0 start

  useFrame(({ gl, scene }) => {
    // wait until atlas is initialized
    if (atlasInfo.length === 0) {
      return;
    }

    // get current atlas face we are filling up
    const currentAtlasFaceIndex = atlasFaceFillIndexRef.current;
    const atlasFaceInfo = atlasInfo[currentAtlasFaceIndex];

    const { mesh, buffer, faceIndex, left, top, right, bottom } = atlasFaceInfo;
    const itemSizeU = (right - left) * atlasWidth;
    const itemSizeV = (bottom - top) * atlasHeight;
    const faceTexelCols = Math.ceil(itemSizeU);
    const faceTexelRows = Math.ceil(itemSizeV);

    // even texel offset from face origin inside texture data
    const fillCount = atlasFaceInfo.pixelFillCount;

    const faceTexelX = fillCount % faceTexelCols;
    const faceTexelY = Math.floor(fillCount / faceTexelCols);

    atlasFaceInfo.pixelFillCount =
      (fillCount + 1) % (faceTexelRows * faceTexelCols);

    // tick up face index when this one is done
    if (atlasFaceInfo.pixelFillCount === 0) {
      atlasFaceFillIndexRef.current =
        (currentAtlasFaceIndex + 1) % atlasInfo.length;

      // tick up atlas texture stack once all faces are done
      // @todo start with face 0
      if (atlasFaceFillIndexRef.current === 4) {
        setAtlasStack((prev) => {
          // promote items up one level, taking last one to be the new first one
          const last = prev[prev.length - 1];
          return [last, ...prev.slice(0, -1)];
        });
      }
    }

    // find texel inside atlas, as rounded to texel boundary
    const atlasTexelLeft = left * atlasWidth;
    const atlasTexelTop = top * atlasWidth;
    const atlasTexelX = Math.floor(atlasTexelLeft) + faceTexelX;
    const atlasTexelY = Math.floor(atlasTexelTop) + faceTexelY;

    // compute rounded texel's U and V position within face
    // (biasing to be in middle of texel physical square)
    const pU = (atlasTexelX + 0.5 - atlasTexelLeft) / itemSizeU;
    const pV = (atlasTexelY + 0.5 - atlasTexelTop) / itemSizeV;

    // read vertex position for this face and interpolate along U and V axes
    const posArray = buffer.attributes.position.array;
    const normalArray = buffer.attributes.normal.array;
    const facePosStart = faceIndex * 4 * 3;
    const facePosOrigin = facePosStart + 2 * 3;
    const facePosU = facePosStart + 3 * 3;
    const facePosV = facePosStart;

    const faceNormalStart = faceIndex * 4 * 3;

    const ox = posArray[facePosOrigin];
    const oy = posArray[facePosOrigin + 1];
    const oz = posArray[facePosOrigin + 2];

    const dUx = posArray[facePosU] - ox;
    const dUy = posArray[facePosU + 1] - oy;
    const dUz = posArray[facePosU + 2] - oz;

    const dVx = posArray[facePosV] - ox;
    const dVy = posArray[facePosV + 1] - oy;
    const dVz = posArray[facePosV + 2] - oz;

    // console.log(atlasTexelX, atlasTexelY, pUVx, pUVy, pUVz);

    // set camera to match texel, first in mesh-local space
    const texelPos = new THREE.Vector3(
      ox + dUx * pU + dVx * pV,
      oy + dUy * pU + dVy * pV,
      oz + dUz * pU + dVz * pV
    );

    probeCam.position.copy(texelPos);

    texelPos.x += normalArray[faceNormalStart];
    texelPos.y += normalArray[faceNormalStart + 1];
    texelPos.z += normalArray[faceNormalStart + 2];

    const upAngle = Math.random() * Math.PI;
    const upAngleCos = Math.cos(upAngle);
    const upAngleSin = Math.sin(upAngle);

    probeCam.up.set(
      dUx * upAngleCos - dVx * upAngleSin,
      dUy * upAngleCos - dVy * upAngleSin,
      dUz * upAngleCos - dVz * upAngleSin
    ); // random rotation (in face plane) @todo normalize axes?

    probeCam.lookAt(texelPos);

    // then, transform camera into world space
    probeCam.applyMatrix4(mesh.matrixWorld);

    gl.setRenderTarget(probeTarget);
    gl.render(lightScene, probeCam);
    gl.setRenderTarget(null);

    gl.readRenderTargetPixels(
      probeTarget,
      0,
      0,
      probeTargetSize,
      probeTargetSize,
      probeData
    );

    // mark debug texture for copying
    probeDebugTexture.needsUpdate = true;

    const probeDataLength = probeData.length;
    let r = 0,
      g = 0,
      b = 0;
    for (let i = 0; i < probeDataLength; i += 4) {
      r += probeData[i];
      g += probeData[i + 1];
      b += probeData[i + 2];
    }

    const pixelCount = probeTargetSize * probeTargetSize;
    const ar = Math.round(r / pixelCount);
    const ag = Math.round(g / pixelCount);
    const ab = Math.round(b / pixelCount);

    atlasStack[0].data.set(
      [ar, ag, ab],
      (atlasTexelY * atlasWidth + atlasTexelX) * 3
    );
    atlasStack[0].texture.needsUpdate = true;
  }, 10);

  return {
    atlasInfo,
    lightSceneRef,
    outputTexture: atlasStack[0].texture,
    lightSceneTexture: atlasStack[1].texture,
    probeDebugTexture
  };
}