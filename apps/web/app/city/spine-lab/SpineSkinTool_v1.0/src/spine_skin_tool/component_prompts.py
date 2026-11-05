"""Current per-part briefs. No unrelated anatomy/ear/face instructions in clothes."""
def brief(part,description,attempt=0):
 view='REAR' if part.endswith('BACK') else 'FRONT'
 common=f'Create ONE isolated transparent RGBA PNG game component {part}, strict orthographic {view}. Match the broad illustrated 2D chibi style of the original references, with simple material-relative colored outlines. Use the original photo as design reference; unseen clothing is an authorised coherent design choice. Output the named component only, fully inside the image. '
 if part.startswith('LEG'):
  body='ONE TROUSER LEG WITH A COMPACT SHOE, a clothing component for a paper-doll game rig. A short broad fabric tube, rounded at its upper end, with a simple rounded shoe attached at the bottom. The whole tube is trouser fabric in the chosen trouser color; match the approximate outfit palette. Sparse fold marks, clear colored contour, simplified Harri proportions. Image1 supplies outfit cues, Image2 original Harri leg supplies construction only, Image3 original component art supplies broad drawing style. '
  variants=['','Clarification: the deliverable is a fabric trouser tube and a shoe, presented as a wardrobe component on transparency. ','Use a simple folded-fabric trouser panel joined to its rounded boot, one continuous game component. ','Use the simplest readable trouser-and-shoe component: solid fabric fill, a few fold marks, colored contour. ']
 elif part.startswith('BODY'):
  body='ONE independent torso garment panel. ONE rounded convex dome with its highest point in the middle, collar marks INSIDE the filled fabric. Shoulder caps and sleeves are separate ARM components; keep this panel shoulder-free. Gently widening sides and a connected curved bowl-shaped lower band in the chosen trouser color for pants; skirt is separate when selected. Sparse broad folds. Image1 supplies outfit cues, Image2 original Harri garment supplies construction only, Image3 original component art supplies broad drawing style. ';variants=['','Clarification: deliver a fabric garment panel as a wardrobe game component. ','Use a single simple fabric panel, internal collar ink and connected rounded lower color band. ','Simplify the garment into a filled domed panel with a few broad fold marks and its chosen palette. ']
 elif part.startswith('SKIRT'):
  body='ONE separate flared A-line skirt panel with a shallow rounded hem, wide enough for the trot leg sweep. Match the chosen outfit palette with sparse broad folds. EriKari supplies spread only, never its print or palette. ';variants=['']*4
 else:
  body='ONE standard thick tubular sleeve/arm component ending in a smooth semicircular mitten shape, with its rounded shoulder cap integrated at the top. Use the declared sleeve length and material-relative palette. ';variants=['']*4
 return common+body+variants[min(3,attempt)]+'\nFrozen part design: '+description


def regeneration_prompt(part,description,base,attempt):
 if part.startswith(('BODY','LEG')):return brief(part,description,attempt)
 return base+'\nTrial '+str(attempt+1)+': create only the named isolated game component in the same fixed design and palette. Simplify its component construction and preserve the original reference identity; return one transparent component PNG.'
