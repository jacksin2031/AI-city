/* Restore fixed ears after animation application; apply direction-specific occlusion. */
globalThis.applySpineOrientation=function(rig,direction,policy){
 if(!policy||rig.skin?.name!==policy.skin)return;
 if(!policy.front_order&&direction!=='back')return;
 if(direction==='back'){
  for(const name of [...policy.face_slots,...(policy.back_hide_slots||[])])rig.findSlot(name)?.pose.setAttachment(null);
 }else rig.findSlot('back-hair')?.pose.setAttachment(null);
 const activeHair=rig.findSlot(direction==='back'?'back-hair':'hair-front');
 if(activeHair)activeHair.pose.setAttachment(rig.getAttachment(activeHair.data.index,direction==='back'?'back-hair':'hair-front')); 
 const ears=['ear-l','ear-r'].map(n=>rig.findSlot(n)).filter(Boolean);
 for(const ear of ears)ear.pose.setAttachment(policy.ear_mode==='INTEGRATED_SMALL_EARS_IN_HAIR'||direction==='back'?null:rig.getAttachment(ear.data.index,'ear'));
 const skirt=rig.findSlot('skirt');
 if(policy.has_skirt&&skirt)skirt.pose.setAttachment(rig.getAttachment(skirt.data.index,direction==='back'?'skirt-back':'skirt'));
 const order=rig.drawOrder.pose;
 const torso=['body',...(policy.has_skirt?['skirt']:[])],arms=['arm-r','arm-l'];
 const group=(direction==='back'?[...arms,...torso]:[...torso,...arms]).map(n=>rig.findSlot(n)).filter(Boolean);
 for(const s of group){const i=order.indexOf(s);if(i>=0)order.splice(i,1);}
 const headNames=new Set(['head-base','ear-l','ear-r','hair-front',...policy.face_slots]);
 let index=order.findIndex(s=>headNames.has(s.data.name));if(index<0)index=order.length;
 order.splice(index,0,...group);
 // Ears remain original weighted attachments, behind both the head surface
 // and hair. Never move ears in front of a hairstyle merely to expose them.
 for(const ear of ears){const i=order.indexOf(ear);if(i>=0)order.splice(i,1);}
 const earAnchor=new Set(['head-base','hair-front',...policy.face_slots]);
 let earIndex=order.findIndex(s=>earAnchor.has(s.data.name));if(earIndex<0)earIndex=order.length;
 order.splice(earIndex,0,...ears);
 if(direction==='back'){
  const head=rig.findSlot('head-base'),hair=rig.findSlot('back-hair');
  if(head&&hair&&order.indexOf(hair)<order.indexOf(head)){order.splice(order.indexOf(hair),1);order.splice(order.indexOf(head)+1,0,hair);}
 }
};
