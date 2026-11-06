import { html, inject } from '@gable/core';
import { RowStore } from '../services/row-store.js';
import { RowView } from './row.js';

export class App {
  static meta = {
    selector: 'app-root',
    imports: [RowView],
    template: html`
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6"><h1>Gable-keyed</h1></div>
            <div class="col-md-6">
              <div class="row">
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="run" (click)="store.run()">Create 1,000 rows</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="runlots" (click)="store.runLots()">Create 10,000 rows</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="add" (click)="store.add()">Append 1,000 rows</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="update" (click)="store.update()">Update every 10th row</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="clear" (click)="store.clear()">Clear</button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button type="button" class="btn btn-primary btn-block" id="swaprows" (click)="store.swapRows()">Swap Rows</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody id="tbody">
            @for (row of store.rows(); track row.id) {
              <tr app-row [row]="row"></tr>
            }
          </tbody>
        </table>
        <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
      </div>
    `,
  };

  store = inject(RowStore);
}
