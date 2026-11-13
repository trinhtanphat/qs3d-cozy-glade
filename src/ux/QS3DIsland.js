/**
 * QS3D Island - a self-contained starter scene, not an import of the Facebook Reel.
 * Generates an actual editable terrain island, surrounding ocean, turquoise
 * pond, cottage with turquoise roof, dirt paths, fencing, flowers and trees.
 * Upstream presets are unaffected.
 */
const smoothstep=(a,b,x)=>{
  const t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
};

export function buildQS3DIsland({world,arch,pipeline}){
  const terrain=world.terrain;
  const n=terrain.gridSize;
  const segs=n-1;
  const cell=terrain.worldSize/segs;
  // Build one continuous terrain mesh. Unlike stamping thousands of brushes,
  // this updates all 65,536 vertices once; the original editor can still sculpt it.
  for(let iz=0;iz<n;iz++){
    const z=(iz-segs/2)*cell;
    for(let ix=0;ix<n;ix++){
      const x=(ix-segs/2)*cell;
      const theta=Math.atan2(z,x);
      const coastRadius=34.5+1.8*Math.sin(theta*3.0+0.35)
        +1.1*Math.sin(theta*5.0-0.6)+0.6*Math.sin(theta*9.0+1.0);
      const radial=Math.hypot(x*0.99,z*1.07);
      const seaMix=smoothstep(coastRadius-4.3,coastRadius+2.8,radial);
      const grassHeight=0.88+0.14*Math.sin(x*0.21)*Math.cos(z*0.24)
        +0.08*Math.sin(x*0.47+z*0.30);
      const seaBed=-2.35+0.12*Math.sin(x*0.23+z*0.31);
      let h=grassHeight*(1-seaMix)+seaBed*seaMix;
      // Round natural pond at the center-left of the island.
      const pondDistance=Math.hypot((x+11.8)/1.17,(z+1.0)/0.92);
      const pondMix=1-smoothstep(5.1,9.5,pondDistance);
      h=h*(1-pondMix)+(-1.65)*pondMix;
      terrain.heights[iz*n+ix]=h;
    }
  }
  terrain._syncRegion(0,0,segs,segs,true);
  terrain._syncSkirtHeights();
  world.foliage?.pruneAndReground?.(null);
  world.foliage?.rebuildShoreFlora?.();
  world.wildlife?.onWorldModified?.();
  pipeline?.water?.updateTerrainTexture?.(world.getHeightDataTexture(),terrain.worldSize);

  // Single timber and masonry cottage on the northern side, near the coast.
  arch.addBuilding({
    type:'cottage', x:9.0,z:-13.0,width:10.5,depth:8.5,
    height:5.8,roofHeight:4.2,roofCurve:0.16,rotation:-0.28,
    roofColor:'teal',wallStyle:'cotswold',tudor:true,
    crenellated:false,seed:131126
  });

  // Walkway from the house to the front coast. It remains editable.
  world.addPath([
    {x:11,z:-8.3},{x:11,z:-3},{x:10,z:2},{x:9,z:7},
    {x:11,z:13},{x:15,z:19},{x:22,z:23}
  ],{width:2.75,style:'dirt'});

  // Footbridge over the front edge of the small freshwater pond.
  world.addPath([
    {x:-11.9,z:-11.6},{x:-11.6,z:-7},{x:-11.2,z:-2},
    {x:-11.8,z:3.5},{x:-13,z:9},{x:-15,z:14}
  ],{width:2.15,style:'cobble'});

  // Rustic boundary fence follows the visitor path.
  arch.addWall([
    {x:-23,z:15},{x:-17,z:18.8},{x:-7,z:21},
    {x:1,z:22},{x:9,z:21},{x:16,z:18}
  ],{type:'fence',height:1.25,wallStyle:'timber',style:'timber'});
  arch.addWall([
    {x:17,z:-5},{x:20,z:1},{x:21,z:6},{x:19,z:11}
  ],{type:'fence',height:1.15,wallStyle:'timber',style:'timber'});

  arch.setPaths(world.getPaths());
  world.syncFootprints(arch.getFootprints());

  // Edge trees, with an intentionally clear view into the glade.
  [
    [-26,-5,5.4,5],[-24,12,4.8,4],[-21,-19,4.0,3],
    [23,-8,5.8,4],[26,9,4.9,4],[11,24,4.8,3],
    [-4,-26,4.8,4],[-27,0,3.4,2]
  ].forEach(([x,z,r,count])=>world.paintTrees?.(x,z,r,count));
  [
    [-2,11,7,0.7],[16,4,6,0.7],[3,-20,7,0.85],
    [-20,19,4,0.7],[22,18,4,0.85]
  ].forEach(([x,z,r,d])=>world.paintFlowers?.(x,z,r,d));

  arch.addClutter?.({
    type:'bench',subtype:'bench',x:0,y:world.getHeightAt(0,13),
    z:13,position:{x:0,y:world.getHeightAt(0,13),z:13},
    rotation:0.2,hostType:'terrain',surface:'ground'
  });

  const envConfig={timeOfDay:13.25,season:'summer',cloudiness:0.16,
    mist:0.08,windStrength:0.48};
  pipeline?.setWeather?.(envConfig);
  pipeline?.setTimeOfDay?.(envConfig.timeOfDay);
  pipeline?.syncPointLights?.(arch.getLanternPositions?.()||[]);
  return {id:'qs3d-island',label:'Đảo Xanh QS3D (Mặc định)',...envConfig,
    cameraTarget:{x:0,y:0.6,z:0}};
}
