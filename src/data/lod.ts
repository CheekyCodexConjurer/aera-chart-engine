export type LodResult = {
  timeMs: Float64Array;
  values: Float64Array;
};

export function decimateMinMax(timeMs: Float64Array, values: Float64Array, maxPoints: number): LodResult {
  if (timeMs.length <= maxPoints) {
    return { timeMs, values };
  }
  const maxBuckets = Math.max(1, Math.floor(maxPoints / 2));
  const bucketSize = Math.ceil(timeMs.length / maxBuckets);
  const outTimes: number[] = [];
  const outValues: number[] = [];
  for (let i = 0; i < timeMs.length; i += bucketSize) {
    const end = Math.min(timeMs.length, i + bucketSize);
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minIndex = i;
    let maxIndex = i;
    for (let j = i; j < end; j += 1) {
      const value = values[j];
      if (value < minValue) {
        minValue = value;
        minIndex = j;
      }
      if (value > maxValue) {
        maxValue = value;
        maxIndex = j;
      }
    }
    if (minIndex <= maxIndex) {
      outTimes.push(timeMs[minIndex], timeMs[maxIndex]);
      outValues.push(minValue, maxValue);
    } else {
      outTimes.push(timeMs[maxIndex], timeMs[minIndex]);
      outValues.push(maxValue, minValue);
    }
  }
  return {
    timeMs: Float64Array.from(outTimes),
    values: Float64Array.from(outValues)
  };
}

export type CandleLodResult = {
  timeMs: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
};

export function decimateCandles(
  timeMs: Float64Array,
  open: Float64Array,
  high: Float64Array,
  low: Float64Array,
  close: Float64Array,
  volume: Float64Array,
  maxPoints: number
): CandleLodResult {
  if (timeMs.length <= maxPoints) {
    return { timeMs, open, high, low, close, volume };
  }
  const bucketSize = Math.ceil(timeMs.length / maxPoints);
  const bucketCount = Math.ceil(timeMs.length / bucketSize);
  const outTime = new Float64Array(bucketCount);
  const outOpen = new Float64Array(bucketCount);
  const outHigh = new Float64Array(bucketCount);
  const outLow = new Float64Array(bucketCount);
  const outClose = new Float64Array(bucketCount);
  const outVolume = new Float64Array(bucketCount);
  let bucket = 0;
  for (let i = 0; i < timeMs.length; i += bucketSize) {
    const end = Math.min(timeMs.length, i + bucketSize);
    outTime[bucket] = timeMs[i];
    outOpen[bucket] = open[i];
    outClose[bucket] = close[end - 1];
    let minLow = Infinity;
    let maxHigh = -Infinity;
    let volumeSum = 0;
    for (let j = i; j < end; j += 1) {
      if (low[j] < minLow) minLow = low[j];
      if (high[j] > maxHigh) maxHigh = high[j];
      if (volume.length > 0) {
        volumeSum += volume[j] ?? 0;
      }
    }
    outLow[bucket] = Number.isFinite(minLow) ? minLow : low[i];
    outHigh[bucket] = Number.isFinite(maxHigh) ? maxHigh : high[i];
    outVolume[bucket] = volume.length > 0 ? volumeSum : 0;
    bucket += 1;
  }
  return {
    timeMs: outTime,
    open: outOpen,
    high: outHigh,
    low: outLow,
    close: outClose,
    volume: outVolume
  };
}
