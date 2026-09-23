import { describe, expect, it } from 'vitest';
import { parseSoftImage, place, placementOf, renderSoftImage } from './softimage';

describe('SoftImage props', () => {
  it('reads a centred image as one with a width and no float', () => {
    const props = parseSoftImage('<SoftImage id="a" aspect="3/4" width="360" />');
    expect(props).toEqual({ id: 'a', aspect: '3/4', float: undefined, width: '360' });
    expect(placementOf(props!)).toBe('centre');
  });

  it('reads the older floatWidth as the width, and writes width', () => {
    const props = parseSoftImage('<SoftImage id="a" aspect="3/4" float="start" floatWidth="330" />')!;
    expect(props.width).toBe('330');
    expect(renderSoftImage(props)).toBe('<SoftImage id="a" aspect="3/4" float="start" width="330" />');
  });

  it('writes no width at the full width of the text', () => {
    expect(renderSoftImage({ id: 'a', aspect: '4/3', ...place('full', '360') })).toBe(
      '<SoftImage id="a" aspect="4/3" />',
    );
  });

  it('keeps the width across a change of placement, and gives one where there was none', () => {
    expect(place('centre', '460')).toEqual({ float: undefined, width: '460' });
    expect(place('end', '460')).toEqual({ float: 'end', width: '460' });
    expect(place('start', undefined)).toEqual({ float: 'start', width: '360' });
  });

  it.each([
    '<SoftImage id="a" aspect="3/4" width="360" />',
    '<SoftImage id="a" aspect="3/4" float="end" width="340" />',
    '<SoftImage id="a" aspect="16/9" />',
  ])('round-trips %s', (source) => {
    expect(renderSoftImage(parseSoftImage(source)!)).toBe(source);
  });
});
