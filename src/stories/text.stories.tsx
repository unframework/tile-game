import React, { useEffect } from 'react';
import { Story, Meta } from '@storybook/react';
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';

import IrradianceSurfaceManager from '../core/IrradianceSurfaceManager';
import WorkManager from '../core/WorkManager';
import IrradianceRenderer from '../core/IrradianceRenderer';
import IrradianceCompositor from '../core/IrradianceCompositor';
import { IrradianceSurface, IrradianceLight } from '../core/IrradianceScene';
import { useIrradianceTexture } from '../core/IrradianceCompositor';
import { AutoUV2, AutoUV2Provider } from '../core/AutoUV2';
import { AutoIndex } from '../core/AutoIndex';
import DebugControls from './DebugControls';
import { DebugOverlayScene } from './DebugOverlayScene';

import './viewport.css';

import helvetikerFontData from './helvetiker.json';
const helvetikerFont = new THREE.Font(helvetikerFontData);

const LIGHT_MAP_RES = 64;

export default {
  title: 'Text mesh scene'
} as Meta;

const FontLoader: React.FC = () => {
  useEffect(() => {}, []);

  return null;
};

export const Main: Story = () => (
  <Canvas
    colorManagement={false} // @todo reconsider
    camera={{ position: [-6, -4, 2], up: [0, 0, 1] }}
    shadowMap
    onCreated={({ gl }) => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 0.9;

      gl.outputEncoding = THREE.sRGBEncoding;
    }}
  >
    <FontLoader />

    <WorkManager>
      <IrradianceSurfaceManager
        lightMapWidth={LIGHT_MAP_RES}
        lightMapHeight={LIGHT_MAP_RES}
        autoStartDelayMs={10}
      >
        {(workbench) => (
          <IrradianceCompositor
            lightMapWidth={LIGHT_MAP_RES}
            lightMapHeight={LIGHT_MAP_RES}
          >
            {(outputLightMap) => (
              <IrradianceRenderer workbench={workbench} factorName={null}>
                {(baseLightTexture, probeTexture) => (
                  <AutoUV2Provider
                    lightMapWidth={LIGHT_MAP_RES}
                    lightMapHeight={LIGHT_MAP_RES}
                    lightMapWorldWidth={16}
                  >
                    <DebugOverlayScene
                      atlasTexture={workbench && workbench.atlasMap.texture}
                      probeTexture={probeTexture}
                    >
                      <scene>
                        <mesh position={[0, 0, -2]} receiveShadow>
                          <planeBufferGeometry
                            attach="geometry"
                            args={[20, 20]}
                          />
                          <meshLambertMaterial
                            attach="material"
                            color="#808080"
                          />
                          <IrradianceSurface />
                        </mesh>

                        <mesh position={[-2, -1, 0]} castShadow receiveShadow>
                          <textBufferGeometry
                            attach="geometry"
                            args={[
                              'Hi',
                              {
                                font: helvetikerFont,
                                size: 4,
                                height: 1.5,
                                curveSegments: 1
                              }
                            ]}
                          />
                          <meshLambertMaterial
                            attach="material"
                            color="#c0c0c0"
                            lightMap={outputLightMap}
                          />

                          <AutoIndex />
                          <AutoUV2 />
                          <IrradianceSurface />
                        </mesh>

                        <directionalLight
                          intensity={1}
                          position={[-2.5, 2.5, 4]}
                          castShadow
                        >
                          <IrradianceLight />
                        </directionalLight>
                      </scene>
                    </DebugOverlayScene>
                  </AutoUV2Provider>
                )}
              </IrradianceRenderer>
            )}
          </IrradianceCompositor>
        )}
      </IrradianceSurfaceManager>
    </WorkManager>

    <DebugControls />
  </Canvas>
);
