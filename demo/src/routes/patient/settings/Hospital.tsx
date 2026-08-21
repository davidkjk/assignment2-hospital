import { ChevronLeft, ExternalLink, MapPin, Phone } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { PhoneFrame } from '@/components/PhoneFrame'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { hospitalInfo } from './mockData'

export function Hospital() {
  const navigate = useNavigate()

  return (
    <PhoneFrame>
      <div data-testid="settings-hospital" className="flex h-full flex-col">
        <header className="flex items-center gap-2 border-b px-5 py-4">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate('/settings')}
            className="-ml-2 rounded-full p-1 hover:bg-muted"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="text-lg font-bold">병원 정보</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-5">
          <Card>
            <CardContent className="space-y-5 py-5">
              <div>
                <h2 className="text-xl font-bold">{hospitalInfo.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">환자 안내 데스크</p>
              </div>

              <div className="space-y-3 border-t pt-4">
                <a
                  href={`tel:${hospitalInfo.phone}`}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
                >
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">전화</span>
                    <span className="block font-medium">{hospitalInfo.phone}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
                <a
                  href={hospitalInfo.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted"
                >
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1">
                    <span className="block text-xs text-muted-foreground">주소</span>
                    <span className="block font-medium">{hospitalInfo.address}</span>
                  </span>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="mt-5 w-full" onClick={() => navigate('/settings')}>
            설정으로 돌아가기
          </Button>
        </main>
      </div>
    </PhoneFrame>
  )
}
