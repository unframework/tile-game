/*
 * Copyright (c) 2020-now Nick Matantsev
 * Licensed under the MIT license
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
  useRef
} from 'react';
import * as THREE from 'three';

import { useIrradianceMapSize } from './IrradianceCompositor';
import IrradianceAtlasMapper, {
  Workbench,
  WorkbenchSceneItem,
  WorkbenchSceneLight,
  WorkbenchMaterialType,
  WorkbenchLightType,
  AtlasMap
} from './IrradianceAtlasMapper';

interface WorkbenchStagingItem {
  mesh: THREE.Mesh;
  material: WorkbenchMaterialType;
  isMapped: boolean;
}

const IrradianceWorkbenchContext = React.createContext<{
  items: { [uuid: string]: WorkbenchStagingItem | undefined };
} | null>(null);

function useWorkbenchStagingContext() {
  const workbenchStage = useContext(IrradianceWorkbenchContext);

  if (!workbenchStage) {
    throw new Error('must be inside manager context');
  }

  return workbenchStage;
}

// allow to attach a mesh to be mapped in texture atlas
export function useMeshRegister(
  mesh: THREE.Mesh | null,
  material: WorkbenchMaterialType | null,
  isMapped: boolean
) {
  const { items } = useWorkbenchStagingContext();

  useEffect(() => {
    if (!mesh || !material) {
      return;
    }

    const uuid = mesh.uuid; // freeze local reference

    // register display item
    items[uuid] = {
      mesh,
      material,
      isMapped
    };

    // on unmount, clean up
    return () => {
      delete items[uuid];
    };
  }, [items, mesh, material]);
}

const IrradianceSceneManager: React.FC<{
  autoStartDelayMs?: number;
  children: (
    workbench: Workbench | null,
    startWorkbench: () => void
  ) => React.ReactNode;
}> = ({ autoStartDelayMs, children }) => {
  const [lightMapWidth, lightMapHeight] = useIrradianceMapSize();

  // read once
  const lightMapWidthRef = useRef(lightMapWidth);
  const lightMapHeightRef = useRef(lightMapHeight);

  // collect current available meshes/lights
  const workbenchStage = useMemo(
    () => ({
      items: {} as { [uuid: string]: WorkbenchStagingItem }
    }),
    []
  );

  // basic snapshot triggered by start handler
  const [workbenchBasics, setWorkbenchBasics] = useState<{
    id: number; // for refresh
    items: WorkbenchSceneItem[];
  } | null>(null);

  const startHandler = useCallback(() => {
    // take a snapshot of existing staging items/lights
    const items = Object.values(workbenchStage.items).map((item) => {
      const { material, isMapped } = item;

      return {
        ...item,
        needsLightMap: isMapped // @todo eliminate separate staging item type
      };
    });

    // save a snapshot copy of staging data
    setWorkbenchBasics((prev) => ({
      id: prev ? prev.id + 1 : 1,
      items
    }));
  }, [workbenchStage]);

  // auto-start helper
  const autoStartDelayMsRef = useRef(autoStartDelayMs); // read once
  useEffect(() => {
    // do nothing if not specified
    if (autoStartDelayMsRef.current === undefined) {
      return;
    }

    const timeoutId = setTimeout(startHandler, autoStartDelayMsRef.current);

    // always clean up on unmount
    return clearTimeout.bind(null, timeoutId);
  }, []);

  // full workbench with atlas map
  const [workbench, setWorkbench] = useState<Workbench | null>(null);

  const atlasMapHandler = useCallback(
    (atlasMap: AtlasMap) => {
      if (!workbenchBasics) {
        throw new Error('unexpected early call');
      }

      // get containing scene reference
      let lightScene = null as THREE.Scene | null;
      workbenchBasics.items[0].mesh.traverseAncestors((object) => {
        if (!lightScene && object instanceof THREE.Scene) {
          lightScene = object;
        }
      });
      if (!lightScene) {
        throw new Error('could not get light scene reference');
      }

      // save final copy of workbench
      setWorkbench({
        id: workbenchBasics.id,
        lightScene,
        lightSceneItems: workbenchBasics.items,
        atlasMap
      });
    },
    [workbenchBasics]
  );

  return (
    <>
      <IrradianceWorkbenchContext.Provider value={workbenchStage}>
        {children(workbench, startHandler)}
      </IrradianceWorkbenchContext.Provider>

      {workbenchBasics && (
        <IrradianceAtlasMapper
          key={workbenchBasics.id} // re-create for new workbench
          width={lightMapWidthRef.current} // read from initial snapshot
          height={lightMapHeightRef.current} // read from initial snapshot
          lightSceneItems={workbenchBasics.items}
          onComplete={atlasMapHandler}
        />
      )}
    </>
  );
};

export default IrradianceSceneManager;
