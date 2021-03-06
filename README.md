## THIS REPO HAS MOVED

> All development has moved to https://github.com/pmndrs/react-three-lightmap. Please see that package (published as [@react-three/lightmap](https://www.npmjs.com/package/@react-three/lightmap)) for newer code and documentation.

# Experimental Lightmap Baker for ThreeJS + react-three-fiber

![test screenshot of lightmap generator](https://unframework.files.wordpress.com/2020/06/ao-bake-test-scene2wide.png?w=1140&h=555)

Quick and cheap global illumination lightmap baking in ThreeJS + react-three-fiber.

[Live editable sandbox](https://codesandbox.io/s/github/unframework/threejs-lightmap-baker).

See screenshots and a brief description here: https://unframework.com/portfolio/simple-global-illumination-lightmap-baker-for-threejs/.

To try the experimental lightmap display locally, do this:

```sh
git clone git@github.com:unframework/threejs-lightmap-baker.git
cd threejs-lightmap-baker
yarn
yarn storybook
```

## Internal Pipeline Overview

The developer defines a scene the same way they normally would, but adds IrradianceSurface and IrradianceLight markers under the meshes and lights that should be participating in the lighting process. The lightmap that is produced by the baker can then simply be attached to scene materials via the `lightMap` prop, as usual.

The following is a brief overview of the renderer architecture.

The data flows as follows:

```
mesh/light definition in scene (with surface marker)
  -> surface manager
      -> atlas mapper
          -> lightmap renderer
              -> lightmap compositor (dummy passthrough for now)
                  -> final lightmap
                      -> mesh material in scene
```

The surface manager has awareness of all the meshes/lights that affect the lightmap. Before baking can begin, there is an extra step: the atlas mapper has to produce a lookup texture that links every future lightmap texel with the 3D position on a mesh triangle that it corresponds to (based on `uv2` information from meshes).

Once that lookup texture is built, baking (lightmap rendering) works in passes. It exposes the result texture at all times, so it is possible to see the lightmap being filled in, texel by texel.

~~Because there might be more than one lightmap factors (e.g. dynamic light intensity arrangements), there is a final compositor step that combines the output of multiple bakers (one per factor) into the final lightmap.~~ The lightmap is passed down to the scene via React context so that it can be easily accessed inside sub-components, etc.

Baking is an intensive process and there could be multiple lightmaps being baked at once, which may overload the GPU. There is a top-level "work manager" that queues up and schedules work snippets from one or more lightmap bakers - a little bit of work is done per each frame, so that the overall app remains responsive and can render intermediate results.
