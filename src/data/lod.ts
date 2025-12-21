export type LodResult = {
  timeMs: Float64Array;
  values: Float64Array;
};

export function decimateMinMax(timeMs: Float64Array, values: Float64Array, maxPoints: number): LodResult {
  if (timeMs.length <= maxPoints) {
    return { timeMs, values };
  }
  const bucketSize = Math.ceil(timeMs.length / maxPoints);
  const outTimes: number[] = [];
  const outValues: number[] = [];
  for (let i = 0; i < timeMs.length; i += bucketSize) {
    const end = Math.min(timeMs.length, i + bucketSize);
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minTime = timeMs[i];
    let maxTime = timeMs[i];
    for (let j = i; j < end; j += 1) {
      const value = values[j];
      if (value < minValue) {
        minValue = value;
        minTime = timeMs[j];
      }
      if (value > maxValue) {
        maxValue = value;
        maxTime = timeMs[j];
      }
    }
    outTimes.push(minTime, maxTime);
    outValues.push(minValue, maxValue);
  }
  return {
    timeMs: Float64Array.from(outTimes),
    values: Float64Array.from(outValues)
  };
}
