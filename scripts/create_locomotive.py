import bpy, math
# Original miniature asset; run from Blender's Python console.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.36
 return m
body=mat('Enamel — tintable',(.8,.8,.8));brass=mat('Aged brass',(.68,.43,.17),.75);iron=mat('Iron',(.035,.045,.04),.5);glass=mat('Cab windows',(.1,.22,.22),.25)
def cube(name,loc,scale,m,bevel=.03):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if bevel: mod=o.modifiers.new('Soft cast edges','BEVEL');mod.width=bevel;mod.segments=2;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
 return o
def cylinder(name,loc,r,depth,m,rot=(0,0,0)):
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=r,depth=depth,location=loc,rotation=rot);o=bpy.context.object;o.name=name;o.data.materials.append(m);o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
cube('Chassis',(0,0,.19),(1.35,.48,.12),iron)
cylinder('Boiler',(.2,0,.43),.205,.8,body,(0,math.pi/2,0))
cylinder('Boiler cap',(.61,0,.43),.207,.04,brass,(0,math.pi/2,0))
cube('Cab',(-.44,0,.48),(.42,.48,.52),body)
cube('Cab roof',(-.45,0,.77),(.53,.61,.07),iron)
for y in [-.246,.246]:cube('Window',(-.43,y,.58),(.24,.014,.2),glass,.015)
cylinder('Chimney',(.43,0,.74),.07,.31,iron)
cylinder('Chimney rim',(.43,0,.895),.095,.05,brass)
cylinder('Steam dome',(.04,0,.67),.09,.15,brass)
for x in [-.46,-.06,.36]:
 for y in [-.27,.27]:
  cylinder('Wheel',(x,y,.16),.15,.065,iron,(math.pi/2,0,0));cylinder('Hub',(x,y*1.14,.16),.068,.016,brass,(math.pi/2,0,0))
for y in [-.31,.31]:cube('Connecting rod',(-.03,y,.16),(.85,.026,.035),brass,.008)
cube('Front bumper',(.72,0,.14),(.13,.6,.09),brass)
cylinder('Headlamp',(.655,0,.57),.058,.07,brass,(0,math.pi/2,0))
bpy.ops.wm.save_as_mainfile(filepath='/Users/shawn/dev/ticket/assets/locomotive.blend')
bpy.ops.export_scene.gltf(filepath='/Users/shawn/dev/ticket/public/models/locomotive.glb',export_format='GLB',export_apply=True)
print('RAILBOUND_ASSET_EXPORTED')
