import React, { useMemo } from 'react';
import { useResource, useFrame, useThree } from 'react-three-fiber';
import * as THREE from 'three';

import { useIrradianceTexture } from './core/IrradianceCompositor';
import { PROBE_BATCH_COUNT } from './core/IrradianceLightProbe';

export const DebugOverlayScene: React.FC<{
  atlasTexture?: THREE.Texture | null;
  probeTexture?: THREE.Texture | null;
}> = React.memo(({ atlasTexture, probeTexture }) => {
  const outputTexture = useIrradianceTexture();

  const [debugSceneRef, debugScene] = useResource<THREE.Scene>();

  const { size } = useThree();
  const debugCamera = useMemo(() => {
    // top-left corner is (0, 100), top-right is (100, 100)
    const aspect = size.height / size.width;
    return new THREE.OrthographicCamera(0, 100, 100, 100 * (1 - aspect), -1, 1);
  }, [size]);

  useFrame(({ gl }) => {
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(debugScene, debugCamera);
    gl.autoClear = true;
  }, 30);

  return (
    <scene ref={debugSceneRef}>
      {outputTexture && (
        <mesh position={[85, 85, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <meshBasicMaterial
            attach="material"
            map={outputTexture}
            toneMapped={false}
          />
        </mesh>
      )}

      {atlasTexture && (
        <mesh position={[85, 64, 0]}>
          <planeBufferGeometry attach="geometry" args={[20, 20]} />
          <meshBasicMaterial
            attach="material"
            map={atlasTexture}
            toneMapped={false}
          />
        </mesh>
      )}

      {probeTexture && (
        <mesh position={[10, 95 - (5 * PROBE_BATCH_COUNT) / 2, 0]}>
          <planeBufferGeometry
            attach="geometry"
            args={[10, 5 * PROBE_BATCH_COUNT]}
          />
          <meshBasicMaterial
            attach="material"
            map={probeTexture}
            toneMapped={false}
          />
        </mesh>
      )}
    </scene>
  );
});