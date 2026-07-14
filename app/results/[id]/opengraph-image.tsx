import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'My Business Matches — IdeaToPlan';

interface Match {
  title?: string;
  incomeRange?: string;
}

type Props = { params: Promise<{ id: string }> };

export default async function Image({ params }: Props) {
  const { id } = await params;

  let matches: Match[] = [];

  try {
    const { supabase } = await import('../../../lib/supabase');
    const { data } = await supabase
      .from('quiz_results')
      .select('matches')
      .eq('id', id)
      .eq('site', 'i2p')
      .single();

    if (data?.matches) {
      matches = data.matches as Match[];
    }
  } catch {
    // fall through to generic branding
  }

  const topTitle    = matches[0]?.title      ?? 'Discover Your Business Match';
  const incomeRange = matches[0]?.incomeRange ?? '';
  const match2      = matches[1]?.title;
  const match3      = matches[2]?.title;
  const moreCount   = Math.max(0, matches.length - 3);

  const titleFontSize =
    topTitle.length > 50 ? '46px' : topTitle.length > 35 ? '56px' : '64px';

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #0D1117 0%, #17140c 100%)',
          padding: '60px 72px',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '30px',
          }}
        >
          <div
            style={{
              color: '#FBF6E3',
              fontSize: '26px',
              fontWeight: 600,
              letterSpacing: '0.12em',
              display: 'flex',
            }}
          >
            IDEATOPLAN
          </div>

          <div
            style={{
              color: '#C9A030',
              fontSize: '18px',
              letterSpacing: '0.1em',
              display: 'flex',
              paddingTop: '4px',
            }}
          >
            BUSINESS MATCH ASSESSMENT
          </div>
        </div>

        <div
          style={{
            color: '#cfc9b8',
            fontSize: '26px',
            display: 'flex',
            marginBottom: '8px',
          }}
        >
          My #1 match:
        </div>

        <div
          style={{
            color: '#FBF6E3',
            fontSize: titleFontSize,
            fontWeight: 700,
            lineHeight: 1.1,
            display: 'flex',
            flexWrap: 'wrap',
            marginBottom: '14px',
          }}
        >
          {topTitle}
        </div>

        {incomeRange && (
          <div
            style={{
              color: '#cfc9b8',
              fontSize: '22px',
              display: 'flex',
              marginBottom: '18px',
            }}
          >
            Income range: {incomeRange}
          </div>
        )}

        {(match2 || moreCount > 0) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {match2 && (
              <div
                style={{
                  color: '#a89f8a',
                  fontSize: '20px',
                  display: 'flex',
                  width: '1056px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                Also matched: {match2}
              </div>
            )}
            {match3 && (
              <div
                style={{
                  color: '#a89f8a',
                  fontSize: '20px',
                  display: 'flex',
                  width: '1056px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}
              >
                Also matched: {match3}
              </div>
            )}
            {moreCount > 0 && (
              <div
                style={{
                  color: '#E8C84A',
                  fontSize: '21px',
                  fontWeight: 700,
                  display: 'flex',
                  marginTop: '4px',
                }}
              >
                + {moreCount} more paths matched to my skills and values
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'linear-gradient(135deg, #8B6914 0%, #E8C84A 35%, #F5E070 55%, #C9A030 75%, #8B6914 100%)',
              color: '#2D1A00',
              fontSize: '22px',
              fontWeight: 600,
              padding: '14px 38px',
              borderRadius: '100px',
            }}
          >
            Take the free assessment
          </div>

          <div
            style={{
              color: '#a89f8a',
              fontSize: '20px',
              display: 'flex',
            }}
          >
            ideatoplan.to/assessment
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '6px',
            background:
              'linear-gradient(90deg, transparent 0%, #C9A030 25%, #F5E070 50%, #C9A030 75%, transparent 100%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size }
  );
}
