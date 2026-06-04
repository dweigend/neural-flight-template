// Point particle — perspective-attenuated size, vertex colour
attribute float aSz;
attribute vec3  aCol;
varying   vec3  vC;

void main() {
  vC = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSz * (360.0 / -mv.z);
  gl_Position  = projectionMatrix * mv;
}
