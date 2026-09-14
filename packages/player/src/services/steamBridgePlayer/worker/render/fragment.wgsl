@binding(0) @group(0) var ySampler: sampler;
@binding(1) @group(0) var uSampler: sampler;
@binding(2) @group(0) var vSampler: sampler;
@binding(3) @group(0) var yTexture: texture_2d<f32>;
@binding(4) @group(0) var uTexture: texture_2d<f32>;
@binding(5) @group(0) var vTexture: texture_2d<f32>;

@fragment
fn fragment_main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let texCoord = fragCoord.xy / vec2<f32>(canvasWidth, canvasHeight);

    let y = textureSample(yTexture, ySampler, texCoord).r;
    let u = textureSample(uTexture, uSampler, texCoord / 2.0).r - 0.5;
    let v = textureSample(vTexture, vSampler, texCoord / 2.0).r - 0.5;

    let r = y + 1.402 * v;
    let g = y - 0.344136 * u - 0.714136 * v;
    let b = y + 1.772 * u;

    return vec4<f32>(r, g, b, 1.0);
}